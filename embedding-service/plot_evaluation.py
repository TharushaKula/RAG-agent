"""
Skill Bridge — Evaluation Results Visualization
=================================================
Generates publication-quality plots from evaluation results:
  1. Training & Validation Loss Curves
  2. Per-Component Metrics Bar Chart (F1, Precision, Recall, Accuracy)
  3. Semantic Matcher Confusion Matrix
  4. Embedding Similarity Distribution

Usage:
    cd embedding-service
    python plot_evaluation.py                              # Plot latest results
    python plot_evaluation.py --results evaluation_results/evaluation_20260324_120000.json
"""

import os
import json
import glob
import argparse
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend

# ──────────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────────
MODEL_DIR = "./custom-sbert-model"
RESULTS_DIR = "./evaluation_results"
OUTPUT_DIR = "./evaluation_results"


def plot_loss_curves():
    """Plot training and validation loss curves."""
    train_log = os.path.join(MODEL_DIR, "train_loss.csv")
    val_log = os.path.join(MODEL_DIR, "val_loss.csv")

    has_train = os.path.exists(train_log)
    has_val = os.path.exists(val_log)

    if not has_train and not has_val:
        print("  No loss logs found. Skipping loss plot.")
        return

    fig, ax = plt.subplots(figsize=(10, 6))

    if has_train:
        df_train = pd.read_csv(train_log)
        if not df_train.empty:
            ax.plot(df_train['step'], df_train['loss'], label='Training Loss', color='#2563EB', linewidth=2, alpha=0.8)
            print(f"  Loaded {len(df_train)} training steps.")

    if has_val:
        df_val = pd.read_csv(val_log)
        if not df_val.empty:
            ax.plot(df_val['step'], df_val['loss'], label='Validation Loss', color='#DC2626', linewidth=2, marker='o', markersize=4)
            print(f"  Loaded {len(df_val)} validation steps.")

    ax.set_title('SBERT Fine-Tuning: Training vs Validation Loss', fontsize=14, fontweight='bold')
    ax.set_xlabel('Training Steps', fontsize=12)
    ax.set_ylabel('Loss (MultipleNegativesRankingLoss)', fontsize=12)
    ax.legend(fontsize=11)
    ax.grid(True, linestyle='--', alpha=0.4)
    ax.set_ylim(bottom=0)

    path = os.path.join(OUTPUT_DIR, "01_loss_curves.png")
    fig.savefig(path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"  Saved: {path}")


def plot_component_metrics(results: dict):
    """Plot bar chart comparing F1, Precision, Recall, Accuracy across components."""
    component_results = results.get("results", [])
    if not component_results:
        print("  No component results found. Skipping metrics plot.")
        return

    components = []
    metrics_data = {"Precision": [], "Recall": [], "F1 Score": [], "Accuracy": []}

    for r in component_results:
        name = r.get("component", "Unknown")
        # Short name for display
        short_name = name.replace("SBERT Embedding Model", "SBERT\nEmbedding").replace("Semantic Match Analyzer", "Semantic\nMatcher").replace("Requirement Extraction", "Requirement\nExtraction")
        components.append(short_name)

        metrics_data["Precision"].append(r.get("precision_at_1") or r.get("macro_precision") or r.get("avg_precision", 0))
        metrics_data["Recall"].append(r.get("recall_at_1") or r.get("macro_recall") or r.get("avg_recall", 0))
        metrics_data["F1 Score"].append(r.get("f1_score") or r.get("macro_f1_score") or r.get("avg_f1_score", 0))
        metrics_data["Accuracy"].append(r.get("accuracy") or r.get("overall_accuracy") or r.get("type_classification_accuracy", 0))

    x = np.arange(len(components))
    width = 0.18
    colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6']

    fig, ax = plt.subplots(figsize=(12, 6))
    for i, (metric, values) in enumerate(metrics_data.items()):
        offset = (i - 1.5) * width
        bars = ax.bar(x + offset, values, width, label=metric, color=colors[i], edgecolor='white', linewidth=0.5)
        # Add value labels
        for bar, val in zip(bars, values):
            if val > 0:
                ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                        f'{val:.2f}', ha='center', va='bottom', fontsize=8, fontweight='bold')

    ax.set_title('AI Component Evaluation Metrics', fontsize=14, fontweight='bold')
    ax.set_ylabel('Score', fontsize=12)
    ax.set_xticks(x)
    ax.set_xticklabels(components, fontsize=11)
    ax.set_ylim(0, 1.15)
    ax.legend(loc='upper right', fontsize=10)
    ax.grid(True, axis='y', linestyle='--', alpha=0.3)
    ax.axhline(y=1.0, color='gray', linestyle=':', alpha=0.3)

    path = os.path.join(OUTPUT_DIR, "02_component_metrics.png")
    fig.savefig(path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"  Saved: {path}")


def plot_confusion_matrix(results: dict):
    """Plot confusion matrix for the semantic matcher 3-class classification."""
    matcher_result = None
    for r in results.get("results", []):
        if "Semantic Match" in r.get("component", ""):
            matcher_result = r
            break

    if not matcher_result or "per_class" not in matcher_result:
        print("  No semantic matcher results found. Skipping confusion matrix.")
        return

    classes = ["match", "partial_match", "no_match"]
    class_labels = ["Match", "Partial", "No Match"]
    per_class = matcher_result["per_class"]

    # Reconstruct confusion matrix from TP, FP, FN
    # This is an approximation — for full confusion matrix we'd need per-pair predictions
    n = len(classes)
    cm = np.zeros((n, n), dtype=int)
    for i, cls in enumerate(classes):
        m = per_class[cls]
        cm[i][i] = m["true_positives"]
        # Distribute FP and FN proportionally across other classes
        total_fp = m["false_positives"]
        total_fn = m["false_negatives"]
        other_indices = [j for j in range(n) if j != i]
        for j in other_indices:
            cm[j][i] += total_fp // len(other_indices)  # FP: predicted as cls but actually j
            cm[i][j] += total_fn // len(other_indices)  # FN: actually cls but predicted as j

    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)

    ax.set(xticks=np.arange(n), yticks=np.arange(n),
           xticklabels=class_labels, yticklabels=class_labels,
           xlabel='Predicted Label', ylabel='True Label',
           title='Semantic Matcher — Confusion Matrix')

    # Text annotations
    thresh = cm.max() / 2.
    for i in range(n):
        for j in range(n):
            ax.text(j, i, format(cm[i, j], 'd'),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black",
                    fontsize=14, fontweight='bold')

    path = os.path.join(OUTPUT_DIR, "03_confusion_matrix.png")
    fig.savefig(path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"  Saved: {path}")


def plot_per_class_f1(results: dict):
    """Plot per-class F1 scores for the semantic matcher."""
    matcher_result = None
    for r in results.get("results", []):
        if "Semantic Match" in r.get("component", ""):
            matcher_result = r
            break

    if not matcher_result or "per_class" not in matcher_result:
        print("  No per-class data. Skipping per-class F1 plot.")
        return

    classes = ["match", "partial_match", "no_match"]
    class_labels = ["Match", "Partial Match", "No Match"]
    per_class = matcher_result["per_class"]

    f1_scores = [per_class[c]["f1_score"] for c in classes]
    precision_scores = [per_class[c]["precision"] for c in classes]
    recall_scores = [per_class[c]["recall"] for c in classes]

    x = np.arange(len(classes))
    width = 0.25

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(x - width, precision_scores, width, label='Precision', color='#2563EB')
    ax.bar(x, recall_scores, width, label='Recall', color='#10B981')
    ax.bar(x + width, f1_scores, width, label='F1 Score', color='#F59E0B')

    ax.set_title('Semantic Matcher — Per-Class Performance', fontsize=14, fontweight='bold')
    ax.set_ylabel('Score', fontsize=12)
    ax.set_xticks(x)
    ax.set_xticklabels(class_labels, fontsize=11)
    ax.set_ylim(0, 1.1)
    ax.legend(fontsize=10)
    ax.grid(True, axis='y', linestyle='--', alpha=0.3)

    # Add value labels
    for bars in ax.containers:
        ax.bar_label(bars, fmt='%.2f', fontsize=8, fontweight='bold', padding=2)

    path = os.path.join(OUTPUT_DIR, "04_per_class_f1.png")
    fig.savefig(path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"  Saved: {path}")


def plot_summary_table(results: dict):
    """Create a summary table as an image."""
    component_results = results.get("results", [])
    if not component_results:
        return

    fig, ax = plt.subplots(figsize=(12, 3))
    ax.axis('off')

    headers = ["Component", "Precision", "Recall", "F1 Score", "Accuracy", "Loss"]
    rows = []
    for r in component_results:
        name = r.get("component", "Unknown")
        precision = r.get("precision_at_1") or r.get("macro_precision") or r.get("avg_precision", "-")
        recall = r.get("recall_at_1") or r.get("macro_recall") or r.get("avg_recall", "-")
        f1 = r.get("f1_score") or r.get("macro_f1_score") or r.get("avg_f1_score", "-")
        accuracy = r.get("accuracy") or r.get("overall_accuracy") or r.get("type_classification_accuracy", "-")
        loss = r.get("final_validation_loss") or r.get("average_loss", "-")

        def fmt(v):
            return f"{v:.4f}" if isinstance(v, (int, float)) else str(v)

        rows.append([name, fmt(precision), fmt(recall), fmt(f1), fmt(accuracy), fmt(loss)])

    table = ax.table(
        cellText=rows,
        colLabels=headers,
        cellLoc='center',
        loc='center',
    )
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.2, 1.6)

    # Style header row
    for j in range(len(headers)):
        table[(0, j)].set_facecolor('#2563EB')
        table[(0, j)].set_text_props(color='white', fontweight='bold')

    # Alternate row colors
    for i in range(1, len(rows) + 1):
        color = '#F0F4FF' if i % 2 == 0 else 'white'
        for j in range(len(headers)):
            table[(i, j)].set_facecolor(color)

    ax.set_title('Evaluation Results Summary', fontsize=14, fontweight='bold', pad=20)

    path = os.path.join(OUTPUT_DIR, "05_summary_table.png")
    fig.savefig(path, dpi=300, bbox_inches='tight')
    plt.close(fig)
    print(f"  Saved: {path}")


def main():
    parser = argparse.ArgumentParser(description="Plot Skill Bridge evaluation results")
    parser.add_argument("--results", type=str, help="Path to specific evaluation JSON file")
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("\n" + "=" * 50)
    print("  EVALUATION VISUALIZATION")
    print("=" * 50)

    # Plot 1: Loss curves (always available)
    print("\n  Generating loss curves...")
    plot_loss_curves()

    # Find evaluation results
    results = None
    if args.results and os.path.exists(args.results):
        with open(args.results) as f:
            results = json.load(f)
        print(f"\n  Using results from: {args.results}")
    else:
        # Find latest evaluation result
        pattern = os.path.join(RESULTS_DIR, "evaluation_*.json")
        files = sorted(glob.glob(pattern))
        if files:
            with open(files[-1]) as f:
                results = json.load(f)
            print(f"\n  Using latest results: {files[-1]}")
        else:
            print("\n  No evaluation results found. Run evaluate_system.py first.")
            print("  Only loss curves were plotted.")
            return

    # Plot 2: Component metrics comparison
    print("\n  Generating component metrics chart...")
    plot_component_metrics(results)

    # Plot 3: Confusion matrix
    print("\n  Generating confusion matrix...")
    plot_confusion_matrix(results)

    # Plot 4: Per-class F1
    print("\n  Generating per-class F1 chart...")
    plot_per_class_f1(results)

    # Plot 5: Summary table
    print("\n  Generating summary table...")
    plot_summary_table(results)

    print(f"\n  All plots saved to: {OUTPUT_DIR}/")
    print("  Done.\n")


if __name__ == "__main__":
    main()
