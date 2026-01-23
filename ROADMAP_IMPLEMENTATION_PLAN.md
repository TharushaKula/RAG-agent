# Roadmap Feature - Implementation Plan

## Overview
Transform the roadmap feature from a static UI with dummy data into a fully functional, AI-powered personalized learning roadmap system that adapts to user profiles, CV analysis, and job descriptions.

---

## 1. System Architecture

### 1.1 Data Models

#### Roadmap Schema (MongoDB)
```typescript
interface Roadmap {
    _id: ObjectId;
    userId: ObjectId;
    title: string;
    description: string;
    category: string; // e.g., "frontend", "backend", "fullstack", "data-science"
    source: "profile" | "cv-analysis" | "jd-analysis" | "manual";
    sourceData?: {
        cvSource?: string;
        jdSource?: string;
        semanticMatchScore?: number;
    };
    stages: RoadmapStage[];
    overallProgress: number;
    estimatedCompletionTime: string; // Based on user's timeAvailability
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
}

interface RoadmapStage {
    id: string;
    name: string;
    description: string;
    order: number;
    modules: RoadmapModule[];
    prerequisites?: string[]; // IDs of required stages
}

interface RoadmapModule {
    id: string;
    title: string;
    description: string;
    status: "completed" | "in-progress" | "locked" | "available";
    order: number;
    estimatedTime: string; // e.g., "2-3 weeks"
    estimatedHours: number; // Calculated based on user's timeAvailability
    resources: LearningResource[];
    prerequisites?: string[]; // IDs of required modules
    completedAt?: Date;
    startedAt?: Date;
    progress: number; // 0-100
}

interface LearningResource {
    id: string;
    type: "video" | "article" | "course" | "book" | "project" | "quiz" | "podcast";
    title: string;
    url?: string;
    description?: string;
    duration?: string;
    difficulty?: "beginner" | "intermediate" | "advanced";
    completed: boolean;
    completedAt?: Date;
}
```

#### User Progress Schema
```typescript
interface UserProgress {
    _id: ObjectId;
    userId: ObjectId;
    roadmapId: ObjectId;
    moduleId: string;
    resourceId?: string;
    status: "started" | "completed";
    progress: number; // 0-100
    timeSpent: number; // in minutes
    notes?: string;
    completedAt?: Date;
    createdAt: Date;
}
```

---

## 2. Roadmap Generation Logic

### 2.1 Roadmap Sources

#### A. Profile-Based Roadmap
- **Trigger**: User completes onboarding/profile setup
- **Input**: `learningGoals`, `learningStyles`, `timeAvailability`
- **Process**:
  1. Analyze learning goals to determine career path
  2. Map goals to relevant roadmap templates
  3. Customize based on learning styles (prefer video vs text resources)
  4. Adjust time estimates based on availability

#### B. CV Analysis-Based Roadmap
- **Trigger**: User uploads CV and requests roadmap
- **Input**: CV text, user profile
- **Process**:
  1. Extract skills from CV using semantic analysis
  2. Identify skill gaps based on learning goals
  3. Generate roadmap to fill gaps
  4. Prioritize missing skills that align with goals

#### C. Job Description-Based Roadmap
- **Trigger**: User uploads JD and requests roadmap
- **Input**: JD text, user profile, optional CV
- **Process**:
  1. Extract requirements from JD
  2. If CV exists, perform semantic match to identify gaps
  3. Generate roadmap to meet JD requirements
  4. Prioritize based on importance and user's current skills

#### D. Hybrid Roadmap (CV + JD)
- **Trigger**: User has both CV and JD uploaded
- **Input**: CV text, JD text, semantic match results
- **Process**:
  1. Use semantic match results to identify specific gaps
  2. Generate targeted roadmap for unmatched requirements
  3. Focus on high-priority skills needed for the job

### 2.2 Roadmap Generation Service

#### Core Service: `roadmapGenerator.ts`
```typescript
class RoadmapGenerator {
    // Main generation method
    async generateRoadmap(
        userId: string,
        source: "profile" | "cv" | "jd" | "hybrid",
        inputData: {
            profile?: UserProfile;
            cvText?: string;
            jdText?: string;
            semanticMatchResult?: MatchResult;
        }
    ): Promise<Roadmap>
    
    // Template-based generation
    private async generateFromTemplate(
        category: string,
        userProfile: UserProfile
    ): Promise<Roadmap>
    
    // AI-powered generation using LLM
    private async generateWithAI(
        context: string,
        userProfile: UserProfile
    ): Promise<Roadmap>
    
    // Gap analysis
    private async analyzeSkillGaps(
        currentSkills: string[],
        requiredSkills: string[]
    ): Promise<SkillGap[]>
    
    // Time estimation
    private calculateTimeEstimate(
        module: RoadmapModule,
        timeAvailability: string
    ): { estimatedTime: string; estimatedHours: number }
    
    // Resource recommendation
    private async recommendResources(
        module: RoadmapModule,
        learningStyles: string[]
    ): Promise<LearningResource[]>
}
```

---

## 3. AI Integration for Roadmap Generation

### 3.1 LLM Prompt Strategy

#### Prompt Template:
```
You are an expert career advisor and learning path designer. Based on the following information, create a comprehensive learning roadmap.

User Profile:
- Learning Goals: {learningGoals}
- Learning Styles: {learningStyles}
- Time Availability: {timeAvailability}
- Age: {age}

Current Skills (from CV): {currentSkills}
Job Requirements (from JD): {requiredSkills}
Skill Gaps Identified: {skillGaps}

Create a structured learning roadmap with:
1. 3-5 stages, each building on the previous
2. 3-6 modules per stage
3. Each module should have:
   - Clear learning objectives
   - Estimated time based on user's availability
   - Prerequisites
   - Learning resources matching user's preferred styles

Format the response as JSON matching this structure:
{
  "title": "Roadmap Title",
  "description": "Brief description",
  "stages": [
    {
      "name": "Stage Name",
      "description": "Stage description",
      "modules": [
        {
          "title": "Module Title",
          "description": "What they'll learn",
          "estimatedTime": "X weeks",
          "prerequisites": []
        }
      ]
    }
  ]
}
```

### 3.2 Implementation Options

#### Option A: Use Existing Chat API
- Leverage the existing `/api/chat` endpoint
- Send structured prompt
- Parse LLM response into roadmap structure
- **Pros**: Reuses existing infrastructure
- **Cons**: Less control, may need prompt engineering

#### Option B: Dedicated Roadmap Generation Endpoint
- Create `/api/roadmap/generate` endpoint
- Use LangChain for structured output
- Better error handling and validation
- **Pros**: More control, better structure
- **Cons**: Additional implementation

**Recommendation**: Start with Option A, migrate to Option B if needed.

---

## 4. Database Implementation

### 4.1 Collections

#### `roadmaps` Collection
- Store generated roadmaps
- Index: `userId`, `isActive`, `createdAt`
- One active roadmap per user (or allow multiple)

#### `user-progress` Collection
- Track module and resource completion
- Index: `userId`, `roadmapId`, `moduleId`
- Used for progress calculation

### 4.2 Progress Calculation

```typescript
async function calculateProgress(roadmapId: string, userId: string): Promise<number> {
    // Get all modules in roadmap
    const roadmap = await getRoadmap(roadmapId);
    const totalModules = roadmap.stages.reduce((sum, stage) => sum + stage.modules.length, 0);
    
    // Get user progress
    const progressRecords = await getUserProgress(userId, roadmapId);
    const completedModules = progressRecords.filter(p => p.status === "completed").length;
    
    // Calculate module-level progress
    const moduleProgress = (completedModules / totalModules) * 100;
    
    // Calculate resource-level progress within in-progress modules
    const inProgressModules = roadmap.stages
        .flatMap(s => s.modules)
        .filter(m => m.status === "in-progress");
    
    let resourceProgress = 0;
    for (const module of inProgressModules) {
        const moduleProgressRecord = progressRecords.find(p => p.moduleId === module.id);
        if (moduleProgressRecord) {
            resourceProgress += moduleProgressRecord.progress;
        }
    }
    
    const avgResourceProgress = inProgressModules.length > 0 
        ? resourceProgress / inProgressModules.length 
        : 0;
    
    // Weighted average: 80% module completion, 20% resource progress
    return (moduleProgress * 0.8) + (avgResourceProgress * 0.2);
}
```

---

## 5. API Endpoints

### 5.1 Roadmap Generation
```
POST /api/roadmap/generate
Body: {
    source: "profile" | "cv" | "jd" | "hybrid",
    cvSource?: string,
    jdSource?: string
}
Response: { roadmap: Roadmap }
```

### 5.2 Get User Roadmaps
```
GET /api/roadmap
Query: ?activeOnly=true
Response: { roadmaps: Roadmap[] }
```

### 5.3 Get Specific Roadmap
```
GET /api/roadmap/:roadmapId
Response: { roadmap: Roadmap }
```

### 5.4 Update Module Status
```
PATCH /api/roadmap/:roadmapId/module/:moduleId
Body: {
    status: "started" | "completed",
    progress?: number
}
Response: { success: boolean, roadmap: Roadmap }
```

### 5.5 Update Resource Status
```
PATCH /api/roadmap/:roadmapId/module/:moduleId/resource/:resourceId
Body: {
    completed: boolean
}
Response: { success: boolean }
```

### 5.6 Delete Roadmap
```
DELETE /api/roadmap/:roadmapId
Response: { success: boolean }
```

---

## 6. Frontend Implementation

### 6.1 RoadmapView Component Updates

#### State Management
```typescript
const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
const [activeRoadmap, setActiveRoadmap] = useState<Roadmap | null>(null);
const [isGenerating, setIsGenerating] = useState(false);
const [selectedSource, setSelectedSource] = useState<"profile" | "cv" | "jd" | "hybrid">("profile");
```

#### Features to Add
1. **Roadmap Selection**: Dropdown to switch between multiple roadmaps
2. **Generate New Roadmap**: Button to create roadmap from different sources
3. **Module Actions**: 
   - "Start Module" button for available modules
   - "Mark Complete" button for in-progress modules
   - Progress tracking slider
4. **Resource View**: Expandable resource list with completion checkboxes
5. **Progress Visualization**: Enhanced progress bars and statistics
6. **Time Tracking**: Display estimated vs actual time spent

### 6.2 New Components

#### `RoadmapGenerator.tsx`
- Modal/dialog for generating new roadmaps
- Source selection (Profile, CV, JD, Hybrid)
- CV/JD dropdown selection
- Loading state during generation

#### `ModuleDetails.tsx`
- Expanded view when module is clicked
- Resource list with checkboxes
- Notes/reflections section
- Time tracking

#### `RoadmapSelector.tsx`
- Dropdown to switch between user's roadmaps
- "Create New" button
- Roadmap metadata (source, creation date, progress)

---

## 7. Roadmap Templates

### 7.1 Pre-defined Templates

Store common roadmap templates in database or config files:

#### Categories:
- Frontend Developer
- Backend Developer
- Full-Stack Developer
- Data Scientist
- DevOps Engineer
- Mobile Developer
- UI/UX Designer
- etc.

#### Template Structure:
```json
{
  "category": "frontend",
  "stages": [
    {
      "name": "Fundamentals",
      "modules": [
        {
          "title": "HTML & CSS",
          "description": "...",
          "estimatedHours": 40,
          "resources": [
            { "type": "video", "title": "...", "url": "..." }
          ]
        }
      ]
    }
  ]
}
```

### 7.2 Template Customization

- Adjust time estimates based on `timeAvailability`
- Filter resources based on `learningStyles`
- Add/remove modules based on user's current skills
- Prioritize modules based on `learningGoals`

---

## 8. Resource Management

### 8.1 Resource Sources

#### Internal Resources
- Curated list of high-quality resources
- Stored in database or config
- Categorized by topic and difficulty

#### External Resources
- YouTube videos (via API or manual curation)
- FreeCodeCamp courses
- MDN Web Docs
- Stack Overflow
- GitHub repositories
- Online courses (Coursera, Udemy, etc.)

### 8.2 Resource Recommendation Algorithm

```typescript
function recommendResources(
    module: RoadmapModule,
    learningStyles: string[],
    difficulty: "beginner" | "intermediate" | "advanced"
): LearningResource[] {
    // Filter by learning style preference
    let resources = getAllResourcesForModule(module);
    
    // Prioritize preferred learning styles
    resources = resources.sort((a, b) => {
        const aScore = learningStyles.includes(a.type) ? 1 : 0;
        const bScore = learningStyles.includes(b.type) ? 1 : 0;
        return bScore - aScore;
    });
    
    // Filter by difficulty
    resources = resources.filter(r => 
        !r.difficulty || r.difficulty === difficulty
    );
    
    // Return top 5-10 resources
    return resources.slice(0, 10);
}
```

---

## 9. Progress Tracking & Analytics

### 9.1 Tracking Events
- Module started
- Module completed
- Resource accessed
- Resource completed
- Time spent on module
- Notes/reflections added

### 9.2 Analytics Dashboard (Future)
- Learning velocity (modules/week)
- Time efficiency (actual vs estimated)
- Most/least completed modules
- Preferred resource types
- Learning streaks

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create database schemas and collections
- [ ] Implement basic roadmap CRUD operations
- [ ] Create roadmap generation service structure
- [ ] Build API endpoints for roadmap management
- [ ] Update RoadmapView to fetch real data

### Phase 2: Roadmap Generation (Week 2)
- [ ] Implement profile-based roadmap generation
- [ ] Integrate with LLM for AI-powered generation
- [ ] Create roadmap templates
- [ ] Implement time estimation logic
- [ ] Add resource recommendation

### Phase 3: CV/JD Integration (Week 3)
- [ ] Implement CV analysis-based roadmap
- [ ] Implement JD analysis-based roadmap
- [ ] Implement hybrid (CV + JD) roadmap
- [ ] Integrate with semantic match results
- [ ] Skill gap analysis

### Phase 4: Progress Tracking (Week 4)
- [ ] Module status updates
- [ ] Resource completion tracking
- [ ] Progress calculation
- [ ] Time tracking
- [ ] Progress persistence

### Phase 5: Enhanced Features (Week 5)
- [ ] Module details view
- [ ] Resource management UI
- [ ] Notes/reflections
- [ ] Roadmap comparison
- [ ] Export roadmap as PDF

### Phase 6: Polish & Optimization (Week 6)
- [ ] Performance optimization
- [ ] Error handling
- [ ] Loading states
- [ ] User feedback
- [ ] Testing

---

## 11. Technical Considerations

### 11.1 LLM Integration
- **Option 1**: Use existing chat API with structured prompts
- **Option 2**: Create dedicated endpoint with LangChain
- **Option 3**: Use OpenAI Function Calling for structured output
- **Recommendation**: Start with Option 1, migrate if needed

### 11.2 Caching Strategy
- Cache generated roadmaps
- Cache resource recommendations
- Cache template data
- Invalidate cache on profile updates

### 11.3 Performance
- Lazy load roadmap data
- Paginate modules if roadmap is large
- Optimize progress calculations
- Use database indexes effectively

### 11.4 Error Handling
- Handle LLM generation failures gracefully
- Provide fallback to template-based generation
- Validate roadmap structure
- Handle missing data scenarios

---

## 12. Data Flow

### 12.1 Roadmap Generation Flow
```
User Action (Generate Roadmap)
    ↓
Frontend: POST /api/roadmap/generate
    ↓
Backend: RoadmapController.generateRoadmap()
    ↓
RoadmapGenerator Service
    ├─ Analyze input (profile/CV/JD)
    ├─ Determine roadmap category
    ├─ Generate roadmap (AI or Template)
    ├─ Customize based on user preferences
    └─ Calculate time estimates
    ↓
Save to Database
    ↓
Return Roadmap to Frontend
    ↓
Display in RoadmapView
```

### 12.2 Progress Update Flow
```
User Action (Complete Module/Resource)
    ↓
Frontend: PATCH /api/roadmap/:id/module/:moduleId
    ↓
Backend: Update module status
    ↓
Update UserProgress collection
    ↓
Recalculate overall progress
    ↓
Update roadmap in database
    ↓
Return updated roadmap
    ↓
Update UI
```

---

## 13. Success Metrics

### 13.1 User Engagement
- % of users who generate at least one roadmap
- Average number of roadmaps per user
- Module completion rate
- Time spent on roadmap feature

### 13.2 Roadmap Quality
- User satisfaction with generated roadmaps
- Accuracy of time estimates
- Relevance of recommended resources
- Completion rate of generated roadmaps

### 13.3 System Performance
- Roadmap generation time (< 10 seconds)
- API response times
- Database query performance
- Error rates

---

## 14. Future Enhancements

### 14.1 Advanced Features
- Collaborative roadmaps (share with mentors)
- Roadmap templates marketplace
- AI-powered adaptive learning paths
- Integration with learning platforms (Coursera, Udemy)
- Gamification (badges, achievements)
- Social features (compare progress with peers)

### 14.2 Analytics & Insights
- Learning analytics dashboard
- Skill progression visualization
- Career path recommendations
- Market demand analysis for skills

### 14.3 Personalization
- ML-based resource recommendations
- Adaptive difficulty adjustment
- Personalized learning pace
- Learning style optimization

---

## 15. Dependencies & Prerequisites

### 15.1 Required Services
- ✅ MongoDB (already set up)
- ✅ LLM/Chat API (already set up)
- ✅ User authentication (already set up)
- ✅ Profile data (already available)

### 15.2 New Dependencies
- None required (can use existing infrastructure)

### 15.3 External APIs (Optional)
- YouTube API (for video resources)
- GitHub API (for project resources)
- Learning platform APIs (for course data)

---

## 16. Testing Strategy

### 16.1 Unit Tests
- Roadmap generation logic
- Progress calculation
- Time estimation
- Resource recommendation

### 16.2 Integration Tests
- API endpoints
- Database operations
- LLM integration
- Frontend-backend communication

### 16.3 E2E Tests
- Complete roadmap generation flow
- Progress tracking flow
- Module completion flow

---

## 17. Documentation Requirements

### 17.1 API Documentation
- Endpoint specifications
- Request/response schemas
- Error codes
- Authentication requirements

### 17.2 User Documentation
- How to generate roadmaps
- How to track progress
- How to customize roadmaps
- FAQ

### 17.3 Developer Documentation
- Architecture overview
- Code structure
- Extension points
- Contribution guidelines

---

## Summary

This implementation plan provides a comprehensive roadmap for building a fully functional, AI-powered learning roadmap system. The phased approach allows for incremental development and testing, ensuring each component works correctly before moving to the next.

**Key Highlights:**
- ✅ Leverages existing infrastructure (MongoDB, LLM, Auth)
- ✅ Multiple roadmap sources (Profile, CV, JD, Hybrid)
- ✅ AI-powered generation with fallback to templates
- ✅ Comprehensive progress tracking
- ✅ Personalized based on user preferences
- ✅ Scalable architecture
- ✅ Clear implementation phases

**Next Steps:**
1. Review and approve this plan
2. Start with Phase 1 (Foundation)
3. Iterate based on feedback
4. Progress through phases systematically
