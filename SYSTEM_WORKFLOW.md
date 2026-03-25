# Skill Bridge — System Process Workflow Charts

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph CLIENT["🌐 Frontend — Next.js 15 (React 19)"]
        direction TB
        UI_AUTH["Login / Signup / Onboarding"]
        UI_CHAT["Chat Interface"]
        UI_CV["CV Analyzer"]
        UI_MATCH["Semantic Matcher"]
        UI_ROADMAP["Roadmap View"]
        UI_GITHUB["GitHub Agent"]
        UI_INDUSTRY["Industry Trends"]
        AUTH_CTX["AuthContext\n(JWT + localStorage)"]
    end

    subgraph BACKEND["⚙️ Backend — Express.js + TypeScript (Port 3001)"]
        direction TB
        MW_AUTH["Auth Middleware\n(JWT Verify)"]
        CTRL_AUTH["authController"]
        CTRL_CHAT["chatController"]
        CTRL_CV["cvController"]
        CTRL_MATCH["semanticMatchController"]
        CTRL_ROADMAP["roadmapController"]
        CTRL_INGEST["ingestController"]
        CTRL_INDUSTRY["industryController"]
        CTRL_GITHUB["GitHubAgentService\n(Socket.IO)"]

        SVC_RAG["ragService\n(LangChain VectorStore)"]
        SVC_EMB["embeddingService\n(HTTP → Python)"]
        SVC_MATCHER["SemanticMatcher"]
        SVC_ROADMAP_GEN["RoadmapGenerator"]
        SVC_ROADMAP_AGENT["RoadmapAgent\n(LLM)"]
    end

    subgraph PYTHON["🐍 Embedding Service — FastAPI (Port 8000)"]
        PY_EMB["SBERT Model\n(768-dim vectors)"]
    end

    subgraph EXTERNAL["☁️ External Services"]
        OLLAMA["Ollama LLM\ngpt-oss:20b-cloud\n(Port 11434)"]
        MONGODB["MongoDB Atlas\n(Vector Store + Data)"]
        YOUTUBE["YouTube API"]
        GITHUB_API["GitHub API"]
        HN_API["Hacker News API"]
        MS_LEARN["Microsoft Learn"]
        MIT_OCW["MIT OpenCourseWare"]
        OPEN_LIB["Open Library"]
    end

    CLIENT <-->|"REST + JWT\nHTTP/JSON"| MW_AUTH
    CLIENT <-->|"Socket.IO\n(GitHub live)"| CTRL_GITHUB
    MW_AUTH --> CTRL_AUTH & CTRL_CHAT & CTRL_CV & CTRL_MATCH & CTRL_ROADMAP & CTRL_INGEST
    CTRL_INDUSTRY <-->|"No auth"| CLIENT

    CTRL_CHAT --> SVC_RAG
    CTRL_CV --> SVC_RAG
    CTRL_INGEST --> SVC_RAG
    CTRL_MATCH --> SVC_MATCHER
    CTRL_ROADMAP --> SVC_ROADMAP_GEN

    SVC_RAG --> SVC_EMB
    SVC_MATCHER --> SVC_EMB
    SVC_ROADMAP_GEN --> SVC_MATCHER
    SVC_ROADMAP_GEN --> SVC_ROADMAP_AGENT

    SVC_EMB <-->|"POST /embed"| PY_EMB
    SVC_RAG <--> MONGODB
    CTRL_AUTH <--> MONGODB
    CTRL_CHAT <--> OLLAMA
    SVC_MATCHER <--> OLLAMA
    SVC_ROADMAP_AGENT <--> OLLAMA
    SVC_ROADMAP_AGENT <--> YOUTUBE & MS_LEARN & MIT_OCW & OPEN_LIB
    CTRL_INDUSTRY <--> HN_API
    CTRL_GITHUB <--> GITHUB_API
```

---

## 2. Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant AC as AuthContext
    participant BE as authController
    participant DB as MongoDB

    User->>FE: Enter email + password

    alt Signup
        FE->>BE: POST /api/auth/signup {email, password, name}
        BE->>DB: Check if email exists
        DB-->>BE: Not found
        BE->>BE: bcrypt.hash(password, 10)
        BE->>DB: Insert user document
        BE->>BE: jwt.sign({userId, email}, JWT_SECRET, 7d)
        BE-->>FE: {token, user{id, name, onboardingCompleted:false}}
        FE->>AC: login(token, user)
        AC->>AC: localStorage.setItem(token, user)
        FE->>FE: Redirect → /onboarding
    else Login
        FE->>BE: POST /api/auth/login {email, password}
        BE->>DB: Find user by email
        DB-->>BE: User document
        BE->>BE: bcrypt.compare(password, hash)
        BE->>BE: jwt.sign({userId, email}, JWT_SECRET, 7d)
        BE-->>FE: {token, user{...profile}}
        FE->>AC: login(token, user)
        AC->>AC: localStorage.setItem(token, user)
        FE->>FE: Redirect → / (Dashboard)
    end

    Note over FE,BE: Every protected request includes<br/>Authorization: Bearer {token}

    FE->>BE: Any protected route + JWT
    BE->>BE: jwt.verify(token, JWT_SECRET)
    alt Token valid
        BE->>BE: req.user = {userId, email}
        BE-->>FE: 200 + data
    else Token expired / invalid
        BE-->>FE: 401 Token expired / 403 Invalid token
        FE->>AC: logout()
        AC->>FE: Redirect → /login
    end
```

---

## 3. RAG Chat Pipeline

```mermaid
flowchart TD
    A([User types message in Chat]) --> B[Frontend adds to messages array]
    B --> C["POST /api/chat\n{messages, activeSources}\n+ Bearer token"]

    C --> D{Auth Middleware}
    D -->|Invalid JWT| E[401 / 403 → Frontend logout]
    D -->|Valid| F[Extract userId from token]

    F --> G["getRetrieverForUser(userId, activeSources)"]
    G --> H["MongoDB Atlas Vector Search\nFilter: userId + source IN activeSources\nk = 10 docs"]

    H --> I["Embed user query\nembeddingService.embed(question)\n→ 768-dim vector"]
    I --> J["Cosine similarity search\nagainst stored document embeddings"]
    J --> K["Retrieve top-10 relevant chunks\nwith metadata: source, type, page"]

    K --> L["Format context string\n[CV] chunk1\n---\n[JD] chunk2\n..."]
    L --> M["Build prompt:\nSystem: 'You are AI career assistant...'\nContext: {retrieved docs}\nUser: {question}"]

    M --> N["ChatOllama.stream()\ngpt-oss:20b-cloud"]
    N --> O["Stream tokens to response\nres.write(token) per chunk"]
    O --> P["Set header:\nX-Sources: base64(JSON sources metadata)"]
    P --> Q([Frontend receives stream])

    Q --> R["Decode token by token\nappend to message bubble"]
    R --> S["Parse X-Sources header\nDisplay source citations"]
    S --> T([Response complete — show in chat])
```

---

## 4. CV Upload & Ingestion Flow

```mermaid
flowchart TD
    A([User uploads CV PDF + JD in CVAnalyzer]) --> B["POST /api/cv/analyze\nFormData: cv file, jdFile/jdText, jdTitle\n+ Bearer token"]

    B --> C[cvController.uploadCVAndJD]
    C --> D["pdf-parse: Extract raw text\nfrom CV PDF"]
    C --> E["pdf-parse: Extract raw text\nfrom JD PDF  ─OR─  use jdText"]

    D --> F["RecursiveCharacterTextSplitter\nchunkSize=1000, overlap=200\n→ CV chunks[]"]
    E --> G["RecursiveCharacterTextSplitter\nchunkSize=1000, overlap=200\n→ JD chunks[]"]

    F --> H["Add metadata to each chunk:\n{source, type:'cv', userId, uploadDate}"]
    G --> I["Add metadata to each chunk:\n{source, type:'jd', userId, uploadDate}"]

    H & I --> J["ragService.addDocuments(docs)"]
    J --> K["For each chunk:\nembeddingService.embed(text)"]
    K --> L["POST http://localhost:8000/embed\nPython SBERT service"]
    L --> M["768-dim float vector returned"]

    M --> N["MongoDB Atlas insert:\n{text, embedding, metadata}"]
    N --> O{More chunks?}
    O -->|Yes| K
    O -->|No| P["Response: {success:true, chunks:N}"]
    P --> Q([Frontend: refresh file list, show success toast])
```

---

## 5. Semantic Match Analyzer Flow

```mermaid
flowchart TD
    A([User selects CV + JD, clicks Match]) --> B["POST /api/cv/semantic-match\n{cvSource, jdSource} or files\n+ Bearer token"]

    B --> C[semanticMatchController]
    C --> D["Retrieve CV text from MongoDB\n(query by source + userId)"]
    C --> E["Retrieve JD text from MongoDB\nor parse uploaded file"]

    D & E --> F["SemanticMatcher.match(cvText, jdText)"]

    subgraph REQ["Requirement Extraction"]
        F --> G{LLM available?}
        G -->|Yes| H["ChatOllama prompt:\n'Extract requirements as JSON\n[{text, type}]'\nTemperature=0.3"]
        H --> I{Parse JSON OK\nand ≥3 results?}
        I -->|Yes| J["Requirements[]"]
        I -->|No| K["Fallback: regex bullet parser\n+ sentence extraction\n+ isLikelyRequirement filter"]
        G -->|No| K
        K --> J
    end

    subgraph CVSEC["CV Section Extraction"]
        F --> L["Match 30+ header patterns:\nSkills / Tech Stack / Competencies\nExperience / Career History\nEducation / Certifications\nSummary / Profile / Objective"]
        L --> M{Sections found?}
        M -->|Yes| N["Sub-chunk large sections\nRecursiveCharacterTextSplitter\nchunkSize=250, overlap=40\nPreserve section type label"]
        M -->|No| O["Chunk entire CV\nchunkSize=250"]
        N & O --> P["CVSection[] with type tags\nskills/experience/education/summary/other"]
    end

    J --> Q["Batch embed all requirements\nembeddingService.embedBatch()"]
    P --> R["Batch embed all CV chunks\nembeddingService.embedBatch()"]

    Q & R --> S["For each requirement:\ncosineSimilarity(reqEmb, cvChunkEmb)\nFind best matching CV chunk"]

    S --> T{Best similarity score}
    T -->|≥ 0.75| U["status: matched ✅"]
    T -->|≥ 0.45| V["status: partially_matched ⚠️"]
    T -->|< 0.45| W["status: not_matched ❌"]

    U & V & W --> X["Weighted overall score:\nskill × 1.3  experience × 1.3\nqualification × 1.1  other × 0.7\nAll requirements included"]

    X --> Y{LLM available?}
    Y -->|Yes| Z["ChatOllama:\nGenerate 4-6 specific actionable\nrecommendations based on gaps"]
    Y -->|No| AA["Template recommendations:\nReference specific requirement types\nSuggest reword / add / certify"]

    Z & AA --> AB["Save result to MongoDB\n{matchId, overallScore, requirements[], recommendations[]}"]
    AB --> AC(["Frontend: Display\nScore % · Per-requirement status\nTop matched CV sections\nActionable recommendations"])
```

---

## 6. Roadmap Generation Flow

```mermaid
flowchart TD
    A([User sets target role, clicks Generate Roadmap]) --> B["POST /api/roadmap/generate\n{source:'cv'|'hybrid', cvSource, jdSource, targetRole}\n+ Bearer token"]

    B --> C[roadmapController.generateRoadmap]
    C --> D["Fetch user profile from MongoDB:\nlearningStyles, timeAvailability\nlearningGoals, age"]

    C --> E{source type?}

    E -->|cv| F["Retrieve CV text from MongoDB"]
    E -->|hybrid| G["Retrieve CV + JD texts\nRun SemanticMatcher.match()\nto identify skill gaps"]

    F --> H["RoadmapGenerator.generateFromCV\n(userId, profile, cvText, targetRole)"]
    G --> I["Extract skill gaps from match result\n{skill, importance, currentLevel, requiredLevel}"]
    I --> H

    H --> J["RoadmapAgent.generateHybrid()\nor generateFromCV()"]

    J --> K["ChatOllama prompt:\n'Analyze CV, identify gaps to targetRole\nGenerate structured learning roadmap\nReturn JSON with stages + modules'"]
    K --> L["LLM returns roadmap JSON:\nstages[{title, modules[{title, topics[]}]}]"]

    L --> M["For each module → fetch resources in parallel"]

    subgraph RESOURCES["Resource Fetching (per Module)"]
        M --> N["YouTubeService.searchVideos(topic)\nFilter: views>1000, educational, relevant"]
        M --> O["MicrosoftLearnService.searchCourses(topic)"]
        M --> P["MITOCWService.searchCourses(topic)"]
        M --> Q["OpenLibraryService.searchBooks(topic)"]
    end

    N & O & P & Q --> R["Assemble LearningResource[]\n{type, title, url, duration, source}"]

    R --> S["Calculate estimated hours:\nbased on user timeAvailability\n(full-time/part-time/minimal)"]

    S --> T["Set module prerequisites\n(sequential stage dependencies)"]

    T --> U["Save Roadmap to MongoDB:\n{userId, title, source, stages[],\noverallProgress:0, isActive:true,\nestimatedCompletionTime}"]

    U --> V(["Frontend: Render RoadmapView\nStage tree with modules\nProgress tracking\nResource links (YouTube, MS Learn, Books)\nLock/unlock stages"])
```

---

## 7. GitHub Profile Analysis Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant SIO as Socket.IO Server
    participant GAS as GitHubAgentService
    participant GHAPI as GitHub REST API

    User->>FE: Enter GitHub profile URL
    FE->>SIO: connect() + emit("start-analysis", {profileUrl})

    SIO->>GAS: startAnalysis(socket, profileUrl)
    GAS->>GAS: Extract username from URL

    GAS-->>FE: emit("status", "Fetching GitHub API data...")

    GAS->>GHAPI: GET /users/{username}
    GHAPI-->>GAS: {bio, location, public_repos, followers, ...}

    GAS->>GHAPI: GET /users/{username}/repos?per_page=100
    GHAPI-->>GAS: repos[] with {name, stars, language, ...}

    GAS->>GAS: Aggregate stats:\ntotalStars = sum(repo.stars)\ntopLanguages = most frequent languages\ntechFocus = infer from languages

    GAS-->>FE: emit("analysis", {bio, location, totalRepos,\ntotalStars, topLanguages, followers, avatar_url})

    loop For each of top 5 repos by stars
        GAS->>GHAPI: GET /repos/{username}/{repo}/commits
        GHAPI-->>GAS: commits[] with {author, date}
        GAS->>GAS: Count commits by user
        GAS-->>FE: emit("analysis", {repoActivity: {name, commits}})
    end

    GAS-->>FE: emit("complete")
    FE->>FE: Render LiveView:\nStats panel · Language breakdown\nTop repositories · Activity timeline
```

---

## 8. Data Architecture

```mermaid
erDiagram
    USERS {
        ObjectId _id
        string email
        string passwordHash
        string name
        boolean onboardingCompleted
        string[] learningStyles
        string timeAvailability
        string[] learningGoals
        number age
        date createdAt
    }

    DOCUMENTS {
        ObjectId _id
        string text
        float[] embedding
        string source
        string type
        string userId
        date uploadDate
        number pageNumber
    }

    ROADMAPS {
        ObjectId _id
        ObjectId userId
        string title
        string source
        RoadmapStage[] stages
        number overallProgress
        string estimatedCompletionTime
        boolean isActive
        date createdAt
    }

    SEMANTIC_MATCHES {
        string matchId
        string userId
        string cvSource
        string jdSource
        number overallScore
        RequirementMatch[] requirements
        string[] recommendations
        date timestamp
    }

    USERS ||--o{ DOCUMENTS : "uploads"
    USERS ||--o{ ROADMAPS : "has"
    USERS ||--o{ SEMANTIC_MATCHES : "performs"
    DOCUMENTS }o--|| SEMANTIC_MATCHES : "used in"
```

---

## 9. End-to-End User Journey

```mermaid
journey
    title Skill Bridge — Complete User Journey
    section Onboarding
        Sign up / Log in: 5: User
        Complete profile (learning style, goals, availability): 4: User
    section Upload & Analyze
        Upload CV (PDF): 5: User, System
        Paste or upload Job Description: 5: User, System
        Documents chunked + embedded + stored: 5: System
    section Understand the Gap
        Run Semantic Match Analyzer: 4: User, System
        View overall fit score: 5: User
        Review per-requirement match status: 5: User
        Read actionable recommendations: 4: User
    section Generate Learning Path
        Generate personalized roadmap: 5: User, System
        AI fetches real YouTube / MS Learn / Books resources: 4: System
        Review staged learning roadmap: 5: User
    section Learn & Track Progress
        Open resources (videos, courses, books): 5: User
        Mark modules complete: 5: User
        Track overall roadmap progress %: 5: User
    section Career Chat Assistant
        Ask questions using CV + JD context: 5: User
        Get RAG-powered personalized answers: 5: System
        View cited source documents: 4: User
    section Explore Ecosystem
        Analyze GitHub profile: 4: User, System
        Browse industry trends (Hacker News): 4: User
```
