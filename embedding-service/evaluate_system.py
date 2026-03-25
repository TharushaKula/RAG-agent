"""
Skill Bridge — Comprehensive AI System Evaluation
===================================================
Calculates F1 Score, Precision, Recall, Loss, and Overall Accuracy
for all evaluable AI components:

  1. SBERT Embedding Model      → Retrieval Precision@K, Recall@K, MRR, Loss
  2. Semantic Match Analyzer    → Precision, Recall, F1, Accuracy (classification)
  3. Requirement Extraction     → Precision, Recall, F1 (information extraction)
  4. Roadmap Generation Agent   → Structural Validity, Topic Coverage, Progression, Category Accuracy
  5. Roadmap Validator Agent    → Binary Classification P/R/F1, Issue Detection Rate
  6. RAG Chat Agent             → Answer Relevance, Faithfulness, Completeness, Answerability

Usage:
    cd embedding-service
    python evaluate_system.py                          # Run all evaluations
    python evaluate_system.py --component embedding    # Run only embedding eval
    python evaluate_system.py --component matching     # Run only matching eval
    python evaluate_system.py --component extraction   # Run only extraction eval
    python evaluate_system.py --component roadmap      # Run only roadmap agent eval
    python evaluate_system.py --component validator    # Run only validator agent eval
    python evaluate_system.py --component ragchat      # Run only RAG chat agent eval
"""

import os
import json
import csv
import argparse
import numpy as np
from datetime import datetime
from typing import List, Dict, Tuple, Any
from collections import Counter
from sentence_transformers import SentenceTransformer
from difflib import SequenceMatcher

# ──────────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────────
MODEL_DIR = "./custom-sbert-model"
EVAL_DATASET = "./evaluation_dataset.json"
RESULTS_DIR = "./evaluation_results"
SIMILARITY_THRESHOLD = 0.38  # Lower bound for partial_match (widened band)
MATCH_THRESHOLD = 0.58       # Upper bound for match (calibrated against SBERT avg positive ~0.60)

os.makedirs(RESULTS_DIR, exist_ok=True)


def load_dataset() -> dict:
    """Load the ground truth evaluation dataset."""
    with open(EVAL_DATASET, "r") as f:
        return json.load(f)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def compute_level_penalty(jd_norm: str, cv_norm: str) -> float:
    """
    Detect when two texts share the same domain but differ in expertise level.
    Returns a penalty between 0 (no mismatch) and 0.25 (strong mismatch).
    Mirrors SemanticMatcher.computeLevelPenalty in the backend.
    """
    import re
    penalty = 0.0

    # 1. Experience-year gap
    year_pattern = re.compile(r'(\d+)\+?\s*years?')
    jd_years = [int(m.group(1)) for m in year_pattern.finditer(jd_norm)]
    cv_years = [int(m.group(1)) for m in year_pattern.finditer(cv_norm)]

    if jd_years and cv_years:
        jd_max = max(jd_years)
        cv_max = max(cv_years)
        if jd_max > 0 and cv_max < jd_max:
            gap = (jd_max - cv_max) / jd_max
            penalty = max(penalty, gap * 0.20)
    elif jd_years and jd_years[0] >= 3 and not cv_years:
        exp_signal = re.search(r'\b(experience|worked|built|developed|managed|led)\b', cv_norm)
        if not exp_signal:
            penalty = max(penalty, 0.12)

    # 2. Expertise-level word mismatch
    high_level = re.compile(r'\b(expert|advanced|strong|proficien|extensive|deep|senior|lead|architect|principal)\b')
    low_level = re.compile(r'\b(basic|beginner|some exposure|introduct|fundament|familiar|personal project|university|coursework|online course|learning|junior|intern)\b')

    if high_level.search(jd_norm) and low_level.search(cv_norm):
        penalty = max(penalty, 0.18)

    # 3. Scale mismatch (production vs personal)
    production = re.compile(r'\b(production|enterprise|at scale|large-scale|distributed|team of \d{2,}|multiple)\b')
    personal = re.compile(r'\b(personal project|small|capstone|assignment|hobby|tutorial|toy|demo)\b')

    if production.search(jd_norm) and personal.search(cv_norm):
        penalty = max(penalty, 0.15)

    return min(penalty, 0.25)


# ══════════════════════════════════════════════
#  1. SBERT EMBEDDING MODEL EVALUATION
# ══════════════════════════════════════════════

def evaluate_embedding_model(model: SentenceTransformer, dataset: dict) -> dict:
    """
    Evaluate the SBERT embedding model using Information Retrieval metrics.

    For each query, rank the positive doc and hard-negative doc by cosine similarity.
    Compute:
        - Precision@1: Is the top result the correct doc?
        - Recall@1:    Did we retrieve the correct doc in top-1?
        - MRR:         Mean Reciprocal Rank
        - Accuracy:    % of queries where positive doc ranked #1
        - Loss:        Read from training logs
    """
    print("\n" + "=" * 60)
    print("  1. SBERT EMBEDDING MODEL EVALUATION")
    print("=" * 60)

    pairs = dataset.get("sbert_retrieval_pairs", [])
    if not pairs:
        print("⚠️  No SBERT retrieval pairs found in dataset.")
        return {}

    correct_at_1 = 0
    reciprocal_ranks = []
    all_similarities_pos = []
    all_similarities_neg = []

    for pair in pairs:
        query = pair["query"]
        pos_doc = pair["positive_doc"]
        neg_doc = pair["hard_negative_doc"]

        # Encode all three
        embeddings = model.encode([query, pos_doc, neg_doc], normalize_embeddings=True)
        q_emb, pos_emb, neg_emb = embeddings[0], embeddings[1], embeddings[2]

        sim_pos = cosine_similarity(q_emb, pos_emb)
        sim_neg = cosine_similarity(q_emb, neg_emb)
        all_similarities_pos.append(sim_pos)
        all_similarities_neg.append(sim_neg)

        # Rank: positive doc should rank higher than negative
        if sim_pos > sim_neg:
            correct_at_1 += 1
            reciprocal_ranks.append(1.0)
        else:
            reciprocal_ranks.append(0.5)  # Rank 2 out of 2

    total = len(pairs)
    precision_at_1 = correct_at_1 / total
    recall_at_1 = correct_at_1 / total  # Same as precision@1 when K=1 and 1 relevant doc
    mrr = np.mean(reciprocal_ranks)
    accuracy = correct_at_1 / total
    f1 = 2 * (precision_at_1 * recall_at_1) / (precision_at_1 + recall_at_1) if (precision_at_1 + recall_at_1) > 0 else 0

    # Average similarity gap (how well model separates positives from negatives)
    avg_pos_sim = np.mean(all_similarities_pos)
    avg_neg_sim = np.mean(all_similarities_neg)
    separation_gap = avg_pos_sim - avg_neg_sim

    # Read loss from training logs
    train_loss_final = None
    val_loss_final = None
    train_loss_file = os.path.join(MODEL_DIR, "train_loss.csv")
    val_loss_file = os.path.join(MODEL_DIR, "val_loss.csv")

    if os.path.exists(train_loss_file):
        with open(train_loss_file) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            if rows:
                train_loss_final = float(rows[-1]["loss"])

    if os.path.exists(val_loss_file):
        with open(val_loss_file) as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            if rows:
                val_loss_final = float(rows[-1]["loss"])

    results = {
        "component": "SBERT Embedding Model",
        "total_queries": total,
        "precision_at_1": round(precision_at_1, 4),
        "recall_at_1": round(recall_at_1, 4),
        "f1_score": round(f1, 4),
        "mrr": round(mrr, 4),
        "accuracy": round(accuracy, 4),
        "avg_positive_similarity": round(avg_pos_sim, 4),
        "avg_negative_similarity": round(avg_neg_sim, 4),
        "separation_gap": round(separation_gap, 4),
        "final_training_loss": train_loss_final,
        "final_validation_loss": val_loss_final,
    }

    print(f"\n  Total queries evaluated:   {total}")
    print(f"  Precision@1:               {precision_at_1:.4f}  ({correct_at_1}/{total})")
    print(f"  Recall@1:                  {recall_at_1:.4f}")
    print(f"  F1 Score:                  {f1:.4f}")
    print(f"  MRR (Mean Reciprocal Rank):{mrr:.4f}")
    print(f"  Overall Accuracy:          {accuracy:.4f}  ({accuracy*100:.1f}%)")
    print(f"  Avg Positive Similarity:   {avg_pos_sim:.4f}")
    print(f"  Avg Negative Similarity:   {avg_neg_sim:.4f}")
    print(f"  Separation Gap:            {separation_gap:.4f}")
    if train_loss_final is not None:
        print(f"  Final Training Loss:       {train_loss_final:.4f}")
    if val_loss_final is not None:
        print(f"  Final Validation Loss:     {val_loss_final:.4f}")

    return results


# ══════════════════════════════════════════════
#  2. SEMANTIC MATCH ANALYZER EVALUATION
# ══════════════════════════════════════════════

def evaluate_semantic_matcher(model: SentenceTransformer, dataset: dict) -> dict:
    """
    Evaluate the Semantic Match Analyzer as a classification task.

    For each (CV chunk, JD requirement) pair with a ground truth label:
      - Compute cosine similarity
      - Predict: match (>=0.75), partial_match (>=0.45), no_match (<0.45)
      - Compare predicted vs ground truth label

    Compute:
      - Per-class Precision, Recall, F1
      - Macro-averaged Precision, Recall, F1
      - Overall Accuracy
      - Simulated loss (1 - similarity for positive pairs, similarity for negative pairs)
    """
    print("\n" + "=" * 60)
    print("  2. SEMANTIC MATCH ANALYZER EVALUATION")
    print("=" * 60)

    pairs = dataset.get("semantic_match_pairs", [])
    if not pairs:
        print("⚠️  No semantic match pairs found in dataset.")
        return {}

    # Label mapping for comparison
    label_map = {"match": "match", "no_match": "no_match", "partial_match": "partial_match"}

    predictions = []
    ground_truths = []
    losses = []

    for pair in pairs:
        cv_chunk = pair["cv_chunk"]
        jd_req = pair["jd_requirement"]
        true_label = pair["label"]

        # Generate embeddings
        embeddings = model.encode([cv_chunk, jd_req], normalize_embeddings=True)
        sim = cosine_similarity(embeddings[0], embeddings[1])

        # Apply level-awareness penalty (mirrors backend SemanticMatcher logic)
        if sim >= 0.40:
            level_penalty = compute_level_penalty(jd_req.lower().strip(), cv_chunk.lower().strip())
            if level_penalty > 0:
                sim = sim * (1.0 - level_penalty)

        # Predict label based on thresholds
        if sim >= MATCH_THRESHOLD:
            pred_label = "match"
        elif sim >= SIMILARITY_THRESHOLD:
            pred_label = "partial_match"
        else:
            pred_label = "no_match"

        predictions.append(pred_label)
        ground_truths.append(true_label)

        # Compute per-sample loss:
        #   For "match" pairs: loss = 1 - similarity (want high similarity)
        #   For "no_match" pairs: loss = max(0, similarity - 0.3) (want low similarity)
        #   For "partial_match" pairs: loss = abs(similarity - 0.6) (want moderate similarity)
        if true_label == "match":
            losses.append(1.0 - sim)
        elif true_label == "no_match":
            losses.append(max(0, sim - 0.3))
        else:  # partial_match
            losses.append(abs(sim - 0.6))

    # Calculate per-class metrics
    classes = ["match", "partial_match", "no_match"]
    class_metrics = {}

    for cls in classes:
        tp = sum(1 for p, g in zip(predictions, ground_truths) if p == cls and g == cls)
        fp = sum(1 for p, g in zip(predictions, ground_truths) if p == cls and g != cls)
        fn = sum(1 for p, g in zip(predictions, ground_truths) if p != cls and g == cls)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        class_metrics[cls] = {
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
        }

    # Macro averages
    macro_precision = np.mean([class_metrics[c]["precision"] for c in classes])
    macro_recall = np.mean([class_metrics[c]["recall"] for c in classes])
    macro_f1 = np.mean([class_metrics[c]["f1_score"] for c in classes])

    # Overall accuracy
    correct = sum(1 for p, g in zip(predictions, ground_truths) if p == g)
    total = len(pairs)
    accuracy = correct / total

    # Average loss
    avg_loss = np.mean(losses)

    # Binary evaluation: treat "match" + "partial_match" as positive
    binary_preds = ["positive" if p in ("match", "partial_match") else "negative" for p in predictions]
    binary_truths = ["positive" if g in ("match", "partial_match") else "negative" for g in ground_truths]
    binary_tp = sum(1 for p, g in zip(binary_preds, binary_truths) if p == "positive" and g == "positive")
    binary_fp = sum(1 for p, g in zip(binary_preds, binary_truths) if p == "positive" and g == "negative")
    binary_fn = sum(1 for p, g in zip(binary_preds, binary_truths) if p == "negative" and g == "positive")
    binary_prec = binary_tp / (binary_tp + binary_fp) if (binary_tp + binary_fp) > 0 else 0
    binary_rec = binary_tp / (binary_tp + binary_fn) if (binary_tp + binary_fn) > 0 else 0
    binary_f1 = 2 * binary_prec * binary_rec / (binary_prec + binary_rec) if (binary_prec + binary_rec) > 0 else 0

    results = {
        "component": "Semantic Match Analyzer",
        "total_pairs": total,
        "correct_predictions": correct,
        "overall_accuracy": round(accuracy, 4),
        "macro_precision": round(macro_precision, 4),
        "macro_recall": round(macro_recall, 4),
        "macro_f1_score": round(macro_f1, 4),
        "average_loss": round(avg_loss, 4),
        "binary_precision": round(binary_prec, 4),
        "binary_recall": round(binary_rec, 4),
        "binary_f1": round(binary_f1, 4),
        "per_class": class_metrics,
        "confusion_matrix": {
            "predictions": dict(Counter(predictions)),
            "ground_truths": dict(Counter(ground_truths)),
        },
    }

    print(f"\n  Total pairs evaluated:     {total}")
    print(f"  Correct predictions:       {correct}/{total}")
    print(f"\n  ── Macro-Averaged Metrics (3-class) ──")
    print(f"  Precision:                 {macro_precision:.4f}")
    print(f"  Recall:                    {macro_recall:.4f}")
    print(f"  F1 Score:                  {macro_f1:.4f}")
    print(f"  Overall Accuracy:          {accuracy:.4f}  ({accuracy*100:.1f}%)")
    print(f"  Average Loss:              {avg_loss:.4f}")
    print(f"\n  ── Binary Metrics (match+partial vs no_match) ──")
    print(f"  Precision:                 {binary_prec:.4f}")
    print(f"  Recall:                    {binary_rec:.4f}")
    print(f"  F1 Score:                  {binary_f1:.4f}")
    print(f"\n  ── Per-Class Breakdown ──")
    for cls in classes:
        m = class_metrics[cls]
        print(f"  [{cls:>15}]  P={m['precision']:.4f}  R={m['recall']:.4f}  F1={m['f1_score']:.4f}  (TP={m['true_positives']}, FP={m['false_positives']}, FN={m['false_negatives']})")

    return results


# ══════════════════════════════════════════════
#  3. REQUIREMENT EXTRACTION EVALUATION
# ══════════════════════════════════════════════

def fuzzy_match_requirement(predicted: str, expected: str, threshold: float = 0.6) -> bool:
    """Check if a predicted requirement fuzzy-matches an expected one."""
    pred_lower = predicted.lower().strip()
    exp_lower = expected.lower().strip()

    # Exact substring match
    if exp_lower in pred_lower or pred_lower in exp_lower:
        return True

    # Sequence matcher ratio
    ratio = SequenceMatcher(None, pred_lower, exp_lower).ratio()
    return ratio >= threshold


def evaluate_requirement_extraction(model: SentenceTransformer, dataset: dict) -> dict:
    """
    Evaluate requirement extraction quality.

    Since the actual extraction uses LLM or regex (not just the embedding model),
    we simulate it by using semantic similarity to match predicted vs expected requirements.

    This measures: can the system identify the same requirements a human would?
    """
    print("\n" + "=" * 60)
    print("  3. REQUIREMENT EXTRACTION EVALUATION")
    print("=" * 60)

    cases = dataset.get("requirement_extraction_cases", [])
    if not cases:
        print("⚠️  No requirement extraction cases found in dataset.")
        return {}

    all_precisions = []
    all_recalls = []
    all_f1s = []
    type_correct = 0
    type_total = 0
    case_details = []

    for i, case in enumerate(cases):
        jd_text = case["jd_text"]
        expected_reqs = case["expected_requirements"]

        # Simulate extraction: split by lines and bullets (mimics regex extraction)
        lines = jd_text.split("\n")
        predicted_reqs = []
        for line in lines:
            line = line.strip()
            if len(line) < 15:
                continue
            # Check for bullet patterns
            import re
            bullet_match = re.match(r'^\s*(?:[\d]+[.)]\s*|[a-z][.)]\s*|\([a-z\d]+\)\s*|[-–—•*●○▪▫►▸✓✔☐]\s*)(.+)$', line, re.I)
            if bullet_match:
                text = bullet_match.group(1).strip()
                if len(text) > 15:
                    # Simple type classification
                    lower = text.lower()
                    if any(w in lower for w in ["year", "experience", "worked", "prior"]):
                        req_type = "experience"
                    elif any(w in lower for w in ["degree", "education", "certification", "master", "bachelor"]):
                        req_type = "qualification"
                    elif any(w in lower for w in ["skill", "proficien", "knowledge", "familiar", "strong", "excellent"]):
                        req_type = "skill"
                    else:
                        req_type = "other"
                    predicted_reqs.append({"text": text, "type": req_type})

        # Match predicted against expected using fuzzy matching
        matched_expected = set()
        matched_predicted = set()

        for j, pred in enumerate(predicted_reqs):
            for k, exp in enumerate(expected_reqs):
                if k not in matched_expected and j not in matched_predicted:
                    if fuzzy_match_requirement(pred["text"], exp["text"]):
                        matched_predicted.add(j)
                        matched_expected.add(k)
                        # Check type accuracy
                        type_total += 1
                        if pred["type"] == exp["type"]:
                            type_correct += 1

        tp = len(matched_expected)
        fp = len(predicted_reqs) - tp
        fn = len(expected_reqs) - tp

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        all_precisions.append(precision)
        all_recalls.append(recall)
        all_f1s.append(f1)

        case_details.append({
            "case_index": i,
            "expected_count": len(expected_reqs),
            "predicted_count": len(predicted_reqs),
            "true_positives": tp,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
        })

        print(f"\n  Case {i+1}: Expected {len(expected_reqs)} reqs, Extracted {len(predicted_reqs)}, TP={tp}")
        print(f"          P={precision:.4f}  R={recall:.4f}  F1={f1:.4f}")

    avg_precision = np.mean(all_precisions)
    avg_recall = np.mean(all_recalls)
    avg_f1 = np.mean(all_f1s)
    type_accuracy = type_correct / type_total if type_total > 0 else 0

    results = {
        "component": "Requirement Extraction",
        "total_cases": len(cases),
        "avg_precision": round(avg_precision, 4),
        "avg_recall": round(avg_recall, 4),
        "avg_f1_score": round(avg_f1, 4),
        "type_classification_accuracy": round(type_accuracy, 4),
        "case_details": case_details,
    }

    print(f"\n  ── Average Across All Cases ──")
    print(f"  Precision:                 {avg_precision:.4f}")
    print(f"  Recall:                    {avg_recall:.4f}")
    print(f"  F1 Score:                  {avg_f1:.4f}")
    print(f"  Type Classification Acc:   {type_accuracy:.4f}  ({type_accuracy*100:.1f}%)")

    return results


# ══════════════════════════════════════════════
#  4. ROADMAP GENERATION AGENT EVALUATION
# ══════════════════════════════════════════════

def classify_by_keywords(text: str) -> str:
    """Port of RoadmapAgent.determineCategoryFromSkills keyword regex (TypeScript → Python)."""
    import re
    t = text.lower()
    if re.search(r'\b(react|vue|angular|frontend|ui|ux|css|html|javascript|typescript)\b', t): return "frontend"
    if re.search(r'\b(node|backend|api|server|database|sql|nosql|express|fastapi)\b', t): return "backend"
    if re.search(r'\b(python|data|machine learning|ai|ml|data science|pandas|numpy|tensorflow)\b', t): return "data-science"
    if re.search(r'\b(devops|docker|kubernetes|aws|azure|cloud|terraform|ci/cd)\b', t): return "devops"
    if re.search(r'\b(full.?stack|fullstack|mern|mean|web development)\b', t): return "fullstack"
    if re.search(r'\b(analytics|bi|tableau|power bi|reporting|business intelligence)\b', t): return "business-analytics"
    if re.search(r'\b(qa|testing|selenium|test automation|quality assurance)\b', t): return "qa"
    if re.search(r'\b(project management|agile|scrum|pmp|delivery)\b', t): return "project-management"
    if re.search(r'\b(product management|product owner|roadmap)\b', t): return "product-management"
    if re.search(r'\b(security|cybersecurity|penetration|compliance)\b', t): return "cybersecurity"
    if re.search(r'\b(design|figma|wireframe|sketch|adobe xd)\b', t): return "design"
    if re.search(r'\b(mobile|ios|android|react native|flutter|swift|kotlin)\b', t): return "mobile"
    return "general"


def evaluate_roadmap_agent(model: SentenceTransformer, dataset: dict) -> dict:
    """
    Evaluate the Roadmap Generation Agent on structural validity, topic relevance,
    progression quality, category classification, and resource quality.
    """
    print("\n" + "=" * 60)
    print("  4. ROADMAP AGENT EVALUATION")
    print("=" * 60)

    cases = dataset.get("roadmap_agent_cases", [])
    cat_cases = dataset.get("category_classification_cases", [])

    if not cases:
        print("⚠️  No roadmap agent cases found in dataset.")
        return {}

    structural_scores = []
    topic_scores = []
    progression_scores = []
    resource_scores = []
    case_details = []

    for case in cases:
        roadmap = case["pre_generated_roadmap"]
        expected_topics = case.get("expected_topic_keywords", [])
        stages = roadmap.get("stages", [])
        is_bad = case.get("is_intentionally_bad", False)

        # ── A. Structural Validity ──
        checks_passed = 0
        checks_total = 0

        # Stage count check
        checks_total += 1
        if 3 <= len(stages) <= 5:
            checks_passed += 1

        all_module_ids = set()
        all_module_titles = []
        has_time_issues = False
        has_prereq_issues = False

        for stage in stages:
            modules = stage.get("modules", [])
            # Module count per stage
            checks_total += 1
            if 3 <= len(modules) <= 6:
                checks_passed += 1

            for m in modules:
                mid = m.get("id", "")
                all_module_ids.add(mid)
                all_module_titles.append(m.get("title", ""))
                # Required fields
                checks_total += 1
                if m.get("title") and m.get("description") and m.get("id"):
                    checks_passed += 1
                # Time estimates
                checks_total += 1
                hours = m.get("estimatedHours", 0)
                if isinstance(hours, (int, float)) and 0 < hours <= 200:
                    checks_passed += 1
                else:
                    has_time_issues = True

        # Duplicate title check
        checks_total += 1
        if len(all_module_titles) == len(set(t.lower() for t in all_module_titles)):
            checks_passed += 1

        # Prerequisite validity
        for stage in stages:
            for m in stage.get("modules", []):
                for prereq in m.get("prerequisites", []):
                    checks_total += 1
                    if prereq in all_module_ids:
                        checks_passed += 1
                    else:
                        has_prereq_issues = True

        structural_score = checks_passed / checks_total if checks_total > 0 else 0
        structural_scores.append(structural_score)

        # ── B. Topic Relevance (embedding similarity) ──
        topic_score = 0.0
        if expected_topics and all_module_titles:
            topic_embs = model.encode(expected_topics, normalize_embeddings=True)
            title_embs = model.encode(all_module_titles, normalize_embeddings=True)
            covered = 0
            for t_emb in topic_embs:
                max_sim = max(cosine_similarity(t_emb, m_emb) for m_emb in title_embs)
                if max_sim >= 0.35:
                    covered += 1
            topic_score = covered / len(expected_topics)
        topic_scores.append(topic_score)

        # ── C. Progression Quality ──
        prog_checks = 0
        prog_total = 0

        # Stage order monotonic
        stage_orders = [s.get("order", 0) for s in stages]
        prog_total += 1
        if stage_orders == sorted(stage_orders) and len(set(stage_orders)) == len(stage_orders):
            prog_checks += 1

        # First stage should have foundational keywords
        if stages:
            first_stage_text = " ".join(m.get("title", "") + " " + m.get("description", "")
                                        for m in stages[0].get("modules", [])).lower()
            last_stage_text = " ".join(m.get("title", "") + " " + m.get("description", "")
                                       for m in stages[-1].get("modules", [])).lower()
            beginner_kw = ["basic", "fundamental", "introduction", "foundation", "essentials", "core", "review", "basics"]
            advanced_kw = ["advanced", "production", "deployment", "optimization", "architecture", "expert", "mlops", "senior"]

            prog_total += 1
            if any(kw in first_stage_text for kw in beginner_kw):
                prog_checks += 1

            prog_total += 1
            if any(kw in last_stage_text for kw in advanced_kw):
                prog_checks += 1

        progression_score = prog_checks / prog_total if prog_total > 0 else 0
        progression_scores.append(progression_score)

        # ── D. Resource Quality ──
        total_modules = sum(len(s.get("modules", [])) for s in stages)
        modules_with_resources = 0
        valid_resources = 0
        total_resources = 0
        for stage in stages:
            for m in stage.get("modules", []):
                resources = m.get("resources", [])
                if resources:
                    modules_with_resources += 1
                for r in resources:
                    total_resources += 1
                    if r.get("url", "").startswith("http") and r.get("title"):
                        valid_resources += 1

        res_coverage = modules_with_resources / total_modules if total_modules > 0 else 0
        res_validity = valid_resources / total_resources if total_resources > 0 else 0
        resource_score = (res_coverage + res_validity) / 2
        resource_scores.append(resource_score)

        case_details.append({
            "case_id": case["id"],
            "structural": round(structural_score, 4),
            "topic_coverage": round(topic_score, 4),
            "progression": round(progression_score, 4),
            "resource_quality": round(resource_score, 4),
            "is_bad": is_bad,
        })

        status = "✅" if not is_bad else ("⚠️ BAD" if structural_score < 0.7 else "❌ BAD not caught")
        print(f"\n  {case['id']}: {status}")
        print(f"    Structural={structural_score:.2f}  Topic={topic_score:.2f}  Progression={progression_score:.2f}  Resources={resource_score:.2f}")

    # ── E. Category Classification ──
    cat_correct = 0
    cat_total = len(cat_cases)
    for cc in cat_cases:
        predicted = classify_by_keywords(cc["input_text"])
        if predicted == cc["expected_category"]:
            cat_correct += 1
    category_accuracy = cat_correct / cat_total if cat_total > 0 else 0

    # Aggregates
    avg_structural = np.mean(structural_scores)
    avg_topic = np.mean(topic_scores)
    avg_progression = np.mean(progression_scores)
    avg_resource = np.mean(resource_scores)
    overall_accuracy = np.mean([avg_structural, avg_topic, avg_progression, category_accuracy, avg_resource])
    avg_precision = avg_topic  # topic coverage = precision (how relevant are modules)
    avg_recall = avg_topic     # topic coverage = recall (how many expected topics found)
    avg_f1 = avg_precision     # same since P=R here

    results = {
        "component": "Roadmap Agent",
        "total_cases": len(cases),
        "category_cases": cat_total,
        "avg_structural_validity": round(avg_structural, 4),
        "avg_topic_coverage": round(avg_topic, 4),
        "avg_progression_score": round(avg_progression, 4),
        "category_accuracy": round(category_accuracy, 4),
        "avg_resource_quality": round(avg_resource, 4),
        "overall_accuracy": round(overall_accuracy, 4),
        "avg_precision": round(avg_precision, 4),
        "avg_recall": round(avg_recall, 4),
        "avg_f1_score": round(avg_f1, 4),
        "average_loss": round(1.0 - overall_accuracy, 4),
        "case_details": case_details,
    }

    print(f"\n  ── Aggregate Metrics ──")
    print(f"  Structural Validity:       {avg_structural:.4f}")
    print(f"  Topic Coverage:            {avg_topic:.4f}")
    print(f"  Progression Quality:       {avg_progression:.4f}")
    print(f"  Category Classification:   {category_accuracy:.4f}  ({cat_correct}/{cat_total})")
    print(f"  Resource Quality:          {avg_resource:.4f}")
    print(f"  Overall Accuracy:          {overall_accuracy:.4f}  ({overall_accuracy*100:.1f}%)")

    return results


# ══════════════════════════════════════════════
#  5. ROADMAP VALIDATOR AGENT EVALUATION
# ══════════════════════════════════════════════

def evaluate_validator_agent(model: SentenceTransformer, dataset: dict) -> dict:
    """
    Evaluate the Roadmap Validator Agent as a binary classifier (valid vs invalid).
    Replicates the 6 validation checks in Python and compares against ground truth.
    """
    print("\n" + "=" * 60)
    print("  5. ROADMAP VALIDATOR AGENT EVALUATION")
    print("=" * 60)

    cases = dataset.get("validator_agent_cases", [])
    if not cases:
        print("⚠️  No validator agent cases found in dataset.")
        return {}

    predictions = []
    ground_truths = []
    issue_detection_hits = 0
    issue_detection_total = 0
    case_details = []

    for case in cases:
        roadmap = case["roadmap"]
        true_label = case["label"]
        stages = roadmap.get("stages", [])
        issues_found = []

        # Check 1: Structure — stage count
        if len(stages) < 3 or len(stages) > 5:
            issues_found.append("structure")

        # Check 1b: Module count per stage
        for stage in stages:
            modules = stage.get("modules", [])
            if len(modules) < 3 or len(modules) > 6:
                if "structure" not in issues_found:
                    issues_found.append("structure")
            if len(modules) == 0:
                if "structure" not in issues_found:
                    issues_found.append("structure")

        # Check 2: Duplicate titles
        all_titles = []
        for stage in stages:
            for m in stage.get("modules", []):
                all_titles.append(m.get("title", "").lower().strip())
        if len(all_titles) != len(set(all_titles)):
            issues_found.append("duplicates")

        # Check 3: Prerequisites validity
        all_ids = set()
        for stage in stages:
            for m in stage.get("modules", []):
                all_ids.add(m.get("id", ""))
        for stage in stages:
            for m in stage.get("modules", []):
                for prereq in m.get("prerequisites", []):
                    if prereq not in all_ids:
                        if "prerequisites" not in issues_found:
                            issues_found.append("prerequisites")

        # Check 4: Time estimates
        for stage in stages:
            for m in stage.get("modules", []):
                hours = m.get("estimatedHours", 0)
                if not isinstance(hours, (int, float)) or hours <= 0 or hours > 200:
                    if "time_estimates" not in issues_found:
                        issues_found.append("time_estimates")

        # Check 5: Progression — stage order
        stage_orders = [s.get("order", 0) for s in stages]
        if stage_orders != sorted(stage_orders):
            issues_found.append("progression")

        predicted_label = "invalid" if len(issues_found) > 0 else "valid"
        predictions.append(predicted_label)
        ground_truths.append(true_label)

        # Issue detection rate (for invalid cases)
        expected_issues = case.get("expected_issue_types", [])
        if expected_issues:
            for eit in expected_issues:
                issue_detection_total += 1
                if eit in issues_found:
                    issue_detection_hits += 1

        case_details.append({
            "case_id": case["id"],
            "true_label": true_label,
            "predicted_label": predicted_label,
            "issues_found": issues_found,
            "correct": predicted_label == true_label,
        })

        status = "✅" if predicted_label == true_label else "❌"
        print(f"  {status} {case['id']}: true={true_label}, pred={predicted_label}, issues={issues_found}")

    # Binary metrics (treat "invalid" as positive class)
    tp = sum(1 for p, g in zip(predictions, ground_truths) if p == "invalid" and g == "invalid")
    fp = sum(1 for p, g in zip(predictions, ground_truths) if p == "invalid" and g == "valid")
    tn = sum(1 for p, g in zip(predictions, ground_truths) if p == "valid" and g == "valid")
    fn = sum(1 for p, g in zip(predictions, ground_truths) if p == "valid" and g == "invalid")

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / len(cases)
    tpr = tp / (tp + fn) if (tp + fn) > 0 else 0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
    issue_det_rate = issue_detection_hits / issue_detection_total if issue_detection_total > 0 else 0

    results = {
        "component": "Roadmap Validator Agent",
        "total_cases": len(cases),
        "correct_predictions": tp + tn,
        "overall_accuracy": round(accuracy, 4),
        "macro_precision": round(precision, 4),
        "macro_recall": round(recall, 4),
        "macro_f1_score": round(f1, 4),
        "true_positive_rate": round(tpr, 4),
        "false_positive_rate": round(fpr, 4),
        "issue_detection_rate": round(issue_det_rate, 4),
        "average_loss": round(1.0 - accuracy, 4),
        "confusion_matrix": {"TP": tp, "FP": fp, "TN": tn, "FN": fn},
        "case_details": case_details,
    }

    print(f"\n  ── Aggregate Metrics ──")
    print(f"  Correct:                   {tp + tn}/{len(cases)}")
    print(f"  Precision:                 {precision:.4f}")
    print(f"  Recall:                    {recall:.4f}")
    print(f"  F1 Score:                  {f1:.4f}")
    print(f"  Overall Accuracy:          {accuracy:.4f}  ({accuracy*100:.1f}%)")
    print(f"  True Positive Rate:        {tpr:.4f}")
    print(f"  False Positive Rate:       {fpr:.4f}")
    print(f"  Issue Detection Rate:      {issue_det_rate:.4f}  ({issue_detection_hits}/{issue_detection_total})")

    return results


# ══════════════════════════════════════════════
#  6. RAG CHAT AGENT EVALUATION
# ══════════════════════════════════════════════

def evaluate_rag_chat_agent(model: SentenceTransformer, dataset: dict) -> dict:
    """
    Evaluate the RAG Chat Agent on answer relevance, faithfulness,
    completeness, and answerability detection.
    """
    print("\n" + "=" * 60)
    print("  6. RAG CHAT AGENT EVALUATION")
    print("=" * 60)

    cases = dataset.get("rag_chat_agent_cases", [])
    if not cases:
        print("⚠️  No RAG chat agent cases found in dataset.")
        return {}

    answer_relevances = []
    faithfulness_scores = []
    completeness_scores = []
    answerability_correct = 0
    answerability_total = 0
    case_details = []

    for case in cases:
        question = case["question"]
        context_text = " ".join(d["text"] for d in case["context_documents"])
        answer = case["pre_generated_answer"]
        answer_lower = answer.lower()

        # ── A. Answer Relevance (cosine sim between question and answer) ──
        q_emb = model.encode(question, normalize_embeddings=True)
        a_emb = model.encode(answer, normalize_embeddings=True)
        answer_relevance = cosine_similarity(q_emb, a_emb)
        answer_relevances.append(answer_relevance)

        # ── B. Faithfulness (keyword grounding + embedding grounding) ──
        context_kw = case.get("faithfulness_context_keywords", [])
        if context_kw:
            kw_hits = sum(1 for kw in context_kw if kw.lower() in answer_lower)
            kw_faithfulness = kw_hits / len(context_kw)
        else:
            kw_faithfulness = 1.0  # No keywords to check (unanswerable case)

        # Embedding-based grounding: how similar is the answer to the context?
        if context_text.strip():
            c_emb = model.encode(context_text, normalize_embeddings=True)
            emb_grounding = cosine_similarity(a_emb, c_emb)
        else:
            emb_grounding = 0.0

        faithfulness = (kw_faithfulness * 0.6 + emb_grounding * 0.4)
        faithfulness_scores.append(faithfulness)

        # ── C. Completeness (expected keyword coverage in answer) ──
        expected_kw = case.get("expected_keywords_in_answer", [])
        if expected_kw:
            found_kw = sum(1 for kw in expected_kw if kw.lower() in answer_lower)
            completeness = found_kw / len(expected_kw)
        else:
            completeness = 1.0
        completeness_scores.append(completeness)

        # ── D. Answerability Detection ──
        is_answerable = case.get("is_answerable", True)
        answerability_total += 1
        refusal_patterns = ["don't have", "cannot find", "not in the context", "no information",
                            "not available", "i don't", "not mentioned", "not in the provided"]
        has_refusal = any(p in answer_lower for p in refusal_patterns)

        if is_answerable and not has_refusal:
            answerability_correct += 1
        elif not is_answerable and has_refusal:
            answerability_correct += 1

        case_details.append({
            "case_id": case["id"],
            "answer_relevance": round(answer_relevance, 4),
            "faithfulness": round(faithfulness, 4),
            "completeness": round(completeness, 4),
            "is_answerable": is_answerable,
            "correctly_handled": (is_answerable and not has_refusal) or (not is_answerable and has_refusal),
        })

        status = "✅" if case_details[-1]["correctly_handled"] else "❌"
        print(f"  {status} {case['id']}: relevance={answer_relevance:.3f}  faith={faithfulness:.3f}  complete={completeness:.3f}  answerable={is_answerable}")

    # Aggregates
    avg_relevance = np.mean(answer_relevances)
    avg_faithfulness = np.mean(faithfulness_scores)
    avg_completeness = np.mean(completeness_scores)
    answerability_acc = answerability_correct / answerability_total if answerability_total > 0 else 0
    overall_accuracy = np.mean([avg_relevance, avg_faithfulness, avg_completeness, answerability_acc])

    # Map to standard summary metrics
    avg_precision = avg_faithfulness    # Of what it says, how much is grounded
    avg_recall = avg_completeness       # Of what it should say, how much did it say
    avg_f1 = 2 * avg_precision * avg_recall / (avg_precision + avg_recall) if (avg_precision + avg_recall) > 0 else 0

    results = {
        "component": "RAG Chat Agent",
        "total_cases": len(cases),
        "avg_answer_relevance": round(avg_relevance, 4),
        "avg_faithfulness": round(avg_faithfulness, 4),
        "avg_completeness": round(avg_completeness, 4),
        "answerability_accuracy": round(answerability_acc, 4),
        "overall_accuracy": round(overall_accuracy, 4),
        "avg_precision": round(avg_precision, 4),
        "avg_recall": round(avg_recall, 4),
        "avg_f1_score": round(avg_f1, 4),
        "average_loss": round(1.0 - overall_accuracy, 4),
        "case_details": case_details,
    }

    print(f"\n  ── Aggregate Metrics ──")
    print(f"  Answer Relevance:          {avg_relevance:.4f}")
    print(f"  Faithfulness:              {avg_faithfulness:.4f}")
    print(f"  Completeness:              {avg_completeness:.4f}")
    print(f"  Answerability Accuracy:    {answerability_acc:.4f}  ({answerability_correct}/{answerability_total})")
    print(f"  Overall Accuracy:          {overall_accuracy:.4f}  ({overall_accuracy*100:.1f}%)")

    return results


# ══════════════════════════════════════════════
#  SUMMARY & EXPORT
# ══════════════════════════════════════════════

def print_summary(all_results: List[dict]):
    """Print a consolidated summary table."""
    print("\n")
    print("=" * 70)
    print("  CONSOLIDATED EVALUATION SUMMARY")
    print("=" * 70)
    print(f"  {'Component':<30} {'Precision':>10} {'Recall':>10} {'F1':>10} {'Accuracy':>10} {'Loss':>10}")
    print("  " + "-" * 80)

    for r in all_results:
        name = r.get("component", "Unknown")
        precision = r.get("precision_at_1") or r.get("macro_precision") or r.get("avg_precision", "-")
        recall = r.get("recall_at_1") or r.get("macro_recall") or r.get("avg_recall", "-")
        f1 = r.get("f1_score") or r.get("macro_f1_score") or r.get("avg_f1_score", "-")
        accuracy = r.get("accuracy") or r.get("overall_accuracy") or r.get("type_classification_accuracy", "-")
        loss = r.get("final_validation_loss") or r.get("average_loss", "-")

        def fmt(v):
            return f"{v:.4f}" if isinstance(v, (int, float)) else str(v)

        print(f"  {name:<30} {fmt(precision):>10} {fmt(recall):>10} {fmt(f1):>10} {fmt(accuracy):>10} {fmt(loss):>10}")

    print("  " + "-" * 80)
    print()


def save_results(all_results: List[dict]):
    """Save results to JSON and CSV."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # JSON (full detail)
    json_path = os.path.join(RESULTS_DIR, f"evaluation_{timestamp}.json")
    with open(json_path, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "model_dir": MODEL_DIR,
            "similarity_threshold": SIMILARITY_THRESHOLD,
            "match_threshold": MATCH_THRESHOLD,
            "results": all_results,
        }, f, indent=2)
    print(f"  Full results saved to:     {json_path}")

    # CSV summary
    csv_path = os.path.join(RESULTS_DIR, f"evaluation_{timestamp}.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Component", "Precision", "Recall", "F1 Score", "Accuracy", "Loss"])
        for r in all_results:
            name = r.get("component", "Unknown")
            precision = r.get("precision_at_1") or r.get("macro_precision") or r.get("avg_precision", "")
            recall = r.get("recall_at_1") or r.get("macro_recall") or r.get("avg_recall", "")
            f1 = r.get("f1_score") or r.get("macro_f1_score") or r.get("avg_f1_score", "")
            accuracy = r.get("accuracy") or r.get("overall_accuracy") or r.get("type_classification_accuracy", "")
            loss = r.get("final_validation_loss") or r.get("average_loss", "")
            writer.writerow([name, precision, recall, f1, accuracy, loss])
    print(f"  CSV summary saved to:      {csv_path}")


# ══════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Skill Bridge AI System Evaluation")
    parser.add_argument("--component", choices=["embedding", "matching", "extraction",
                                                  "roadmap", "validator", "ragchat", "all"],
                        default="all", help="Which component to evaluate")
    parser.add_argument("--model-dir", default=MODEL_DIR, help="Path to SBERT model directory")
    args = parser.parse_args()

    print("\n" + "▓" * 70)
    print("  SKILL BRIDGE — AI SYSTEM EVALUATION")
    print("▓" * 70)
    print(f"  Model:     {args.model_dir}")
    print(f"  Dataset:   {EVAL_DATASET}")
    print(f"  Component: {args.component}")
    print(f"  Timestamp: {datetime.now().isoformat()}")

    # Load model
    model_path = args.model_dir if os.path.exists(args.model_dir) else "all-mpnet-base-v2"
    print(f"\n  Loading model from: {model_path}")
    model = SentenceTransformer(model_path)
    print(f"  Embedding dimensions: {model.get_sentence_embedding_dimension()}")

    # Load dataset
    dataset = load_dataset()

    all_results = []

    if args.component in ("embedding", "all"):
        result = evaluate_embedding_model(model, dataset)
        if result:
            all_results.append(result)

    if args.component in ("matching", "all"):
        result = evaluate_semantic_matcher(model, dataset)
        if result:
            all_results.append(result)

    if args.component in ("extraction", "all"):
        result = evaluate_requirement_extraction(model, dataset)
        if result:
            all_results.append(result)

    if args.component in ("roadmap", "all"):
        result = evaluate_roadmap_agent(model, dataset)
        if result:
            all_results.append(result)

    if args.component in ("validator", "all"):
        result = evaluate_validator_agent(model, dataset)
        if result:
            all_results.append(result)

    if args.component in ("ragchat", "all"):
        result = evaluate_rag_chat_agent(model, dataset)
        if result:
            all_results.append(result)

    if all_results:
        print_summary(all_results)
        save_results(all_results)

    print("\n  Evaluation complete.\n")


if __name__ == "__main__":
    main()
