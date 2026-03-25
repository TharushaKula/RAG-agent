"""
Skill Bridge — SBERT Fine-Tuning Script
=========================================
Fine-tunes the all-mpnet-base-v2 model on domain-specific data (career matching,
CV/JD analysis, RAG retrieval) using MultipleNegativesRankingLoss.

Uses training_data.json (210 training + 30 validation pairs) instead of hardcoded examples.

Usage:
    cd embedding-service
    python train_sbert.py
    python train_sbert.py --epochs 5 --batch-size 8
"""

import os
import json
import argparse
import pandas as pd
from torch.utils.data import DataLoader
from sentence_transformers import SentenceTransformer, losses, InputExample, evaluation
from sentence_transformers.training_args import SentenceTransformerTrainingArguments
from transformers import TrainerCallback
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────────
MODEL_NAME = "all-mpnet-base-v2"
OUTPUT_DIR = "./custom-sbert-model"
TRAINING_DATA = "./training_data.json"

os.makedirs(OUTPUT_DIR, exist_ok=True)


def load_training_data(path: str):
    """Load training and validation pairs from JSON file."""
    with open(path, "r") as f:
        data = json.load(f)

    train_examples = [
        InputExample(texts=[pair["query"], pair["positive"]])
        for pair in data["train"]
    ]
    eval_examples = [
        InputExample(texts=[pair["query"], pair["positive"]])
        for pair in data["validation"]
    ]

    logger.info(f"Loaded {len(train_examples)} training pairs and {len(eval_examples)} validation pairs from {path}")
    return train_examples, eval_examples, data


# ──────────────────────────────────────────────
#  Custom Callback to Track Loss
# ──────────────────────────────────────────────
class LossLoggingCallback(TrainerCallback):
    """Extract training and validation loss per step and save to CSV."""
    def __init__(self, log_dir):
        self.train_logs = []
        self.val_logs = []
        self.log_file_train = os.path.join(log_dir, 'train_loss.csv')
        self.log_file_val = os.path.join(log_dir, 'val_loss.csv')

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs is not None:
            step = state.global_step
            if 'loss' in logs:
                self.train_logs.append({"step": step, "loss": logs['loss']})
                pd.DataFrame(self.train_logs).to_csv(self.log_file_train, index=False)
            if 'eval_loss' in logs:
                self.val_logs.append({"step": step, "loss": logs['eval_loss']})
                pd.DataFrame(self.val_logs).to_csv(self.log_file_val, index=False)


# ──────────────────────────────────────────────
#  Information Retrieval Evaluator
# ──────────────────────────────────────────────
def create_ir_evaluator(data: dict, name: str = "ir_eval"):
    """
    Create an InformationRetrievalEvaluator from the validation set.
    This computes MRR, NDCG, Precision@K, Recall@K during training.
    """
    queries = {}
    corpus = {}
    relevant_docs = {}

    val_pairs = data["validation"]

    for i, pair in enumerate(val_pairs):
        qid = f"q{i}"
        did = f"d{i}"
        queries[qid] = pair["query"]
        corpus[did] = pair["positive"]
        relevant_docs[qid] = {did}

    # Add some negative corpus entries from training set (for ranking difficulty)
    for i, pair in enumerate(data["train"][:50]):
        did = f"d_neg_{i}"
        corpus[did] = pair["positive"]

    evaluator = evaluation.InformationRetrievalEvaluator(
        queries=queries,
        corpus=corpus,
        relevant_docs=relevant_docs,
        name=name,
        precision_recall_at_k=[1, 3, 5, 10],
        mrr_at_k=[1, 3, 5, 10],
        ndcg_at_k=[1, 3, 5, 10],
        write_csv=True,
    )

    return evaluator


# ──────────────────────────────────────────────
#  Main Training Function
# ──────────────────────────────────────────────
def train(epochs: int = 10, batch_size: int = 8, lr: float = 2e-5, warmup_ratio: float = 0.1):
    """Fine-tune the SBERT model."""

    # Load data
    if not os.path.exists(TRAINING_DATA):
        logger.error(f"Training data not found at {TRAINING_DATA}. Run with the default hardcoded data.")
        return

    train_examples, eval_examples, raw_data = load_training_data(TRAINING_DATA)

    # Create data loaders
    train_dataloader = DataLoader(train_examples, batch_size=batch_size, shuffle=True)
    eval_dataloader = DataLoader(eval_examples, batch_size=batch_size)

    # Load model
    logger.info(f"Loading base model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    logger.info(f"Embedding dimensions: {model.get_sentence_embedding_dimension()}")

    # Loss function
    train_loss = losses.MultipleNegativesRankingLoss(model=model)

    # Create IR evaluator for precision/recall/MRR tracking during training
    ir_evaluator = create_ir_evaluator(raw_data)

    # Training arguments
    total_steps = len(train_dataloader) * epochs
    warmup_steps = int(total_steps * warmup_ratio)
    eval_steps = max(1, len(train_dataloader) // 2)  # Evaluate twice per epoch

    logger.info(f"Training config: {epochs} epochs, batch_size={batch_size}, lr={lr}")
    logger.info(f"Total steps: {total_steps}, warmup: {warmup_steps}, eval every {eval_steps} steps")

    training_args = SentenceTransformerTrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=lr,
        warmup_steps=warmup_steps,
        eval_strategy="steps",
        eval_steps=eval_steps,
        logging_steps=max(1, len(train_dataloader) // 4),  # Log 4 times per epoch
        save_strategy="epoch",
        report_to="none",
    )

    # Initialize callback
    loss_logger = LossLoggingCallback(OUTPUT_DIR)

    # Train
    logger.info("Starting fine-tuning...")
    try:
        model.fit(
            train_objectives=[(train_dataloader, train_loss)],
            evaluator=ir_evaluator,
            epochs=epochs,
            steps_per_epoch=len(train_dataloader),
            warmup_steps=warmup_steps,
            output_path=OUTPUT_DIR,
            save_best_model=True,
            evaluation_steps=eval_steps,
        )
        logger.info(f"Training complete! Model saved to {OUTPUT_DIR}")
    except Exception as e:
        logger.error(f"model.fit() failed: {e}")
        logger.info("Attempting fallback training method...")
        try:
            from sentence_transformers import SentenceTransformerTrainer
            trainer = SentenceTransformerTrainer(
                model=model,
                args=training_args,
                train_dataset=train_examples,
                eval_dataset=eval_examples,
                loss=train_loss,
                evaluator=ir_evaluator,
                callbacks=[loss_logger],
            )
            trainer.train()
            model.save(OUTPUT_DIR)
            logger.info(f"Fallback training complete! Model saved to {OUTPUT_DIR}")
        except Exception as e2:
            logger.error(f"Fallback training also failed: {e2}")
            raise

    # Run final evaluation
    logger.info("Running final evaluation...")
    final_metrics = ir_evaluator(model, output_path=OUTPUT_DIR)
    logger.info("Final IR Evaluation Metrics:")
    for key, value in sorted(final_metrics.items()):
        logger.info(f"  {key}: {value:.4f}")

    # Save final metrics summary
    metrics_path = os.path.join(OUTPUT_DIR, "final_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump({k: round(v, 4) for k, v in final_metrics.items()}, f, indent=2)
    logger.info(f"Metrics saved to {metrics_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune SBERT for Skill Bridge")
    parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=8, help="Training batch size")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate")
    parser.add_argument("--warmup-ratio", type=float, default=0.1, help="Warmup ratio")
    args = parser.parse_args()

    train(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, warmup_ratio=args.warmup_ratio)
