from scripts.sync_past_seasons import sync_season

if __name__ == "__main__":
    print("Retrying 2024 and 2025...")
    sync_season(2024)
    sync_season(2025)
