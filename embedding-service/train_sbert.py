import os
import pandas as pd
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader
from sentence_transformers import SentenceTransformer, losses, InputExample
from sentence_transformers.training_args import SentenceTransformerTrainingArguments
from transformers import TrainerCallback
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. Configuration Check
# ---------------------------------------------------------------------------
MODEL_NAME = "all-mpnet-base-v2"
OUTPUT_DIR = "./custom-sbert-model"

# Create output dir if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 2. Prepare Sample Dataset (Replace with your actual RAG dataset)
# ---------------------------------------------------------------------------
logger.info("Preparing datasets...")
# In a real scenario, load this from a JSONL or CSV file containing your domain data.
# Format for MultipleNegativesRankingLoss: (Anchor, Positive)
# - Anchor: The user's query/question
# - Positive: The correct document/paragraph that answers the query
train_examples = [
    InputExample(texts=["How do I deploy the RAG agent?", "To deploy the RAG agent, run the docker-compose.yml file located in the root directory."]),
    InputExample(texts=["What language is the embedding service written in?", "The embedding service is written in Python using FastAPI."]),
    InputExample(texts=["How to reset the database?", "You can reset the database using the clear_db.sh script in the tools folder."]),
    InputExample(texts=["Where are the logs stored?", "Logs are stored in the /var/log/rag-agent directory within the container."]),
    InputExample(texts=["What model does the embedding service use?", "It uses the all-mpnet-base-v2 model from sentence-transformers."]),
    InputExample(texts=["How to increase timeout?", "Adjust the TIMEOUT parameter in the .env file."]),
    InputExample(texts=["Can I use a custom model?", "Yes, place your model in the custom-sbert-model folder and update the path in main.py."]),
    InputExample(texts=["Is there an API reference?", "The FastAPI swagger docs are available at /docs on port 8000."]),
]

# Validation pairs (used to check if the model is learning globally, not just memorizing)
eval_examples = [
    InputExample(texts=["How to check system health?", "Ping the /health endpoint to check service status."]),
    InputExample(texts=["What is the default port?", "The embedding service runs on port 8000 by default."]),
    InputExample(texts=["How to send batch requests?", "Use the /embed/batch endpoint with a list of strings."]),
]

# For MultipleNegativesRankingLoss we often don't need dedicated targets, just pairs.
train_dataloader = DataLoader(train_examples, batch_size=4, shuffle=True)
eval_dataloader = DataLoader(eval_examples, batch_size=4)

# ---------------------------------------------------------------------------
# 3. Model and Loss Setup
# ---------------------------------------------------------------------------
logger.info(f"Loading Base Model: {MODEL_NAME}")
model = SentenceTransformer(MODEL_NAME)

# MultipleNegativesRankingLoss is currently the state-of-the-art for retrieval/RAG
train_loss = losses.MultipleNegativesRankingLoss(model=model)

# ---------------------------------------------------------------------------
# 4. Custom Callback to Track Loss
# ---------------------------------------------------------------------------
class LossLoggingCallback(TrainerCallback):
    """
    Custom callback to extract training and validation loss per step
    and save them to a file for plotting later.
    """
    def __init__(self, log_dir):
        self.train_logs = []
        self.val_logs = []
        self.log_file_train = os.path.join(log_dir, 'train_loss.csv')
        self.log_file_val = os.path.join(log_dir, 'val_loss.csv')
        
    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs is not None:
            step = state.global_step
            # Hugging Face Trainer logs training loss as 'loss' and validation loss as 'eval_loss'
            if 'loss' in logs:
                self.train_logs.append({"step": step, "loss": logs['loss']})
                pd.DataFrame(self.train_logs).to_csv(self.log_file_train, index=False)
            if 'eval_loss' in logs:
                self.val_logs.append({"step": step, "loss": logs['eval_loss']})
                pd.DataFrame(self.val_logs).to_csv(self.log_file_val, index=False)

# ---------------------------------------------------------------------------
# 5. Training Arguments (Adjust for your hardware and dataset size)
# ---------------------------------------------------------------------------
# Note: For real datasets, you want num_train_epochs between 1-5, and batch sizes around 16-64.
# Using small values here for testing purposes.
logger.info("Setting up Trainer...")
training_args = SentenceTransformerTrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=10,                      # Elevated to 10 for dummy dataset so we get a good curve
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    learning_rate=2e-5,
    warmup_steps=10,
    eval_strategy="steps",                    # Evaluate every N steps
    eval_steps=2,                             # Very frequent for demo purposes
    logging_steps=1,                          # Log training every step for demo
    save_strategy="epoch",                    # Save model checkpoint every epoch
    report_to="none"                          # Disable wandb/tensorboard so it doesn't prompt you
)

# Initialize the callback
loss_logger = LossLoggingCallback(OUTPUT_DIR)

# ---------------------------------------------------------------------------
# 6. Start Fine-Tuning
# ---------------------------------------------------------------------------
logger.info("Starting fine-tuning...")

# The SentenceTransformer framework >= 3.0 uses the HuggingFace Trainer syntax
try:
    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        evaluator=None, # In HF Trainer, eval is handled separately if passing eval_dataset to args, but fit method is easier below
        epochs=training_args.num_train_epochs,
        steps_per_epoch=len(train_dataloader),
        warmup_steps=int(len(train_dataloader) * training_args.num_train_epochs * 0.1),
        output_path=OUTPUT_DIR,
        save_best_model=True,
    )
    logger.info(f"Training Complete! Model saved to {OUTPUT_DIR}")
except Exception as e:
    logger.error(f"Training using v2.x method (model.fit) failed. Depending on the transformers version, use Trainer instead: {e}")
    # Fallback to pure Transformers approach if needed, but model.fit is universally supported in sentence_transformers

# Note: since sentence-transformers model.fit doesn't easily expose the raw loss in a plottable way 
# in version 2.7.x (which is in your requirements.txt), we actually need to extract it via tensorboard
# or manually log it. The above `model.fit` might not trigger the HF Trainer callback in older versions.
#
# Let's create a robust log parser/plotter regardless!
