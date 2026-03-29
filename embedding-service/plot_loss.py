import os
import pandas as pd
import matplotlib.pyplot as plt

# Configuration
LOG_DIR = "./custom-sbert-model"
TRAIN_LOG = os.path.join(LOG_DIR, "train_loss.csv")
VAL_LOG = os.path.join(LOG_DIR, "val_loss.csv")
OUTPUT_PLOT = os.path.join(LOG_DIR, "loss_plot.png")

def plot_losses():
    print(f"Checking for logs in {LOG_DIR}...")
    
    has_train = os.path.exists(TRAIN_LOG)
    has_val = os.path.exists(VAL_LOG)
    
    if not has_train and not has_val:
        print("No loss logs found! Please run the fine-tuning script first.")
        return

    plt.figure(figsize=(10, 6))
    
    if has_train:
        df_train = pd.read_csv(TRAIN_LOG)
        if not df_train.empty:
            plt.plot(df_train['step'], df_train['loss'], label='Training Loss', color='blue', alpha=0.7)
            print(f"Loaded {len(df_train)} training steps.")
            
    if has_val:
        df_val = pd.read_csv(VAL_LOG)
        if not df_val.empty:
            plt.plot(df_val['step'], df_val['loss'], label='Validation Loss', color='red', marker='o')
            print(f"Loaded {len(df_val)} validation steps.")

    # Chart formatting
    plt.title('SBERT Fine-Tuning: Training vs. Validation Loss')
    plt.xlabel('Training Steps')
    plt.ylabel('Loss (MultipleNegativesRankingLoss)')
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.6)
    
    # Check if we have any lines plotted
    if not plt.gca().get_lines():
        print("Logs are empty.")
        return
        
    # Save the plot
    try:
        plt.savefig(OUTPUT_PLOT, dpi=300, bbox_inches='tight')
        print(f"Loss plot successfully saved to: {OUTPUT_PLOT}")
    except Exception as e:
        print(f"Error saving plot: {e}")

if __name__ == "__main__":
    plot_losses()
