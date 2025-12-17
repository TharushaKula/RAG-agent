import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from backend.core.database import get_vector_store
from backend.core.config import settings

async def scrape_github_profile(url: str):
    username = url.split("/")[-1]
    
    # Data structure
    profile_data = {
        "totalContributions": 0,
        "commits": 0,
        "issues": 0,
        "pullRequests": 0,
        "reviews": 0,
        "repos": 0,
        "currentStreak": 0,
        "longestStreak": 0,
        "activeDays": 0,
        "isExact": False
    }

    # 1. Scrape Main Profile for Repos & Fallbacks
    try:
        res = requests.get(url)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            
            # Repo Count
            repo_tab = soup.select_one('a[href*="tab=repositories"] .Counter')
            if repo_tab:
                try:
                    profile_data["repos"] = int(repo_tab.get_text(strip=True))
                except:
                    pass
    except Exception as e:
        print(f"Error scraping main profile: {e}")

    # 2. Scrape Contributions (heatmap)
    try:
        contrib_url = f"https://github.com/users/{username}/contributions"
        res = requests.get(contrib_url)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            
            # Total
            h2 = soup.select_one('h2.f4')
            if h2:
                text = h2.get_text(strip=True)
                import re
                nums = re.findall(r'\d+', text.replace(',', ''))
                if nums:
                    profile_data["totalContributions"] = int(nums[0])

            # Streaks
            days = []
            for day in soup.select("td.ContributionCalendar-day"):
                count_str = day.get("data-count", "0")
                date_str = day.get("data-date")
                if date_str:
                    days.append({"date": date_str, "count": int(count_str)})
            
            days.sort(key=lambda x: x["date"])
            
            # Calc logic
            longest_streak = 0
            temp_streak = 0
            for d in days:
                if d["count"] > 0:
                    temp_streak += 1
                else:
                    longest_streak = max(longest_streak, temp_streak)
                    temp_streak = 0
            longest_streak = max(longest_streak, temp_streak)
            
            current_streak = 0
            # Iterate backwards
            today = datetime.now().strftime("%Y-%m-%d")
            for d in reversed(days):
                if d["count"] > 0:
                    current_streak += 1
                else:
                    if d["date"] == today:
                        continue
                    break
            
            profile_data["currentStreak"] = current_streak
            profile_data["longestStreak"] = longest_streak
            profile_data["activeDays"] = len([d for d in days if d["count"] > 0])
            
    except Exception as e:
        print(f"Error scraping contributions: {e}")

    # 3. GraphQL if Token
    if settings.GITHUB_TOKEN:
        try:
            query = """
            query($username: String!) {
                user(login: $username) {
                    repositories { totalCount }
                    contributionsCollection {
                        totalCommitContributions
                        totalIssueContributions
                        totalPullRequestContributions
                        totalPullRequestReviewContributions
                    }
                }
            }
            """
            headers = {"Authorization": f"Bearer {settings.GITHUB_TOKEN}"}
            resp = requests.post("https://api.github.com/graphql", json={"query": query, "variables": {"username": username}}, headers=headers)
            data = resp.json()
            
            if "data" in data and data["data"].get("user"):
                user = data["data"]["user"]
                if user.get("repositories"):
                    profile_data["repos"] = user["repositories"]["totalCount"]
                
                if user.get("contributionsCollection"):
                    cc = user["contributionsCollection"]
                    profile_data["commits"] = cc["totalCommitContributions"]
                    profile_data["issues"] = cc["totalIssueContributions"]
                    profile_data["pullRequests"] = cc["totalPullRequestContributions"]
                    profile_data["reviews"] = cc["totalPullRequestReviewContributions"]
                    profile_data["isExact"] = True

        except Exception as e:
            print(f"GraphQL Error: {e}")

    # Create Summary
    summary = f"""
GitHub Profile Analysis for User: {username}
Source URL: {url}
---
Total Repositories: {profile_data['repos']}
Total Contributions (Last Year): {profile_data['totalContributions']}
Detailed Breakdown:
- Commits: {profile_data['commits']}
- Issues: {profile_data['issues']}
- PRs: {profile_data['pullRequests']}
- Reviews: {profile_data['reviews']}
---
Activity Stats:
- Current Streak: {profile_data['currentStreak']} days
- Longest Streak: {profile_data['longestStreak']} days
- Active Days: {profile_data['activeDays']} days
""".strip()

    vector_store = get_vector_store()
    await vector_store.aadd_documents([Document(page_content=summary, metadata={"source": url, "type": "profile"})])
    return True

import tempfile
import fnmatch
from langchain_community.document_loaders import GitLoader

async def ingest_github_repo(repo_url: str, user_id: str = "all"):
    # Use GitLoader with a temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        ignore_paths = ["package-lock.json", "yarn.lock", "*.svg", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico"]
        
        def file_filter(file_path):
            return not any(fnmatch.fnmatch(file_path, pattern) for pattern in ignore_paths)

        # Clone repo
        loader = GitLoader(
            repo_path=temp_dir,
            clone_url=repo_url,
            branch="main", # Default to main, could be dynamic
            file_filter=file_filter
        )
        docs = loader.load()

        # Split
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_documents(docs)

        # Add Metadata
        for doc in chunks:
            doc.metadata["source"] = repo_url
            doc.metadata["user_id"] = user_id
        
        # Ingest
        vector_store = get_vector_store()
        await vector_store.aadd_documents(chunks)

        return len(chunks)

