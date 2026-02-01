import { ObjectId } from "mongodb";
import { getRoadmapsCollection, Roadmap, RoadmapModule, RoadmapStage } from "../models/Roadmap";
import { getUserProgressCollection, UserProgress } from "../models/Roadmap";

export class RoadmapService {
    /**
     * Get all roadmaps for a user
     */
    async getUserRoadmaps(userId: string, activeOnly: boolean = false): Promise<Roadmap[]> {
        const collection = await getRoadmapsCollection();
        const query: any = { userId: new ObjectId(userId) };
        
        if (activeOnly) {
            query.isActive = true;
        }
        
        return collection.find(query).sort({ createdAt: -1 }).toArray();
    }

    /**
     * Get a specific roadmap by ID
     */
    async getRoadmap(roadmapId: string, userId: string): Promise<Roadmap | null> {
        const collection = await getRoadmapsCollection();
        return collection.findOne({
            _id: new ObjectId(roadmapId),
            userId: new ObjectId(userId)
        });
    }

    /**
     * Create a new roadmap
     */
    async createRoadmap(roadmap: Omit<Roadmap, "_id" | "createdAt" | "updatedAt">): Promise<Roadmap> {
        const collection = await getRoadmapsCollection();
        
        // Deactivate other roadmaps if this one should be active
        if (roadmap.isActive) {
            await collection.updateMany(
                { userId: roadmap.userId, isActive: true },
                { $set: { isActive: false } }
            );
        }
        
        const newRoadmap: Roadmap = {
            ...roadmap,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        const result = await collection.insertOne(newRoadmap);
        return { ...newRoadmap, _id: result.insertedId };
    }

    /**
     * Update a roadmap
     */
    async updateRoadmap(roadmapId: string, userId: string, updates: Partial<Roadmap>): Promise<Roadmap | null> {
        const collection = await getRoadmapsCollection();
        
        const updateData = {
            ...updates,
            updatedAt: new Date()
        };
        
        // If setting as active, deactivate others
        if (updates.isActive === true) {
            await collection.updateMany(
                { userId: new ObjectId(userId), isActive: true, _id: { $ne: new ObjectId(roadmapId) } },
                { $set: { isActive: false } }
            );
        }
        
        const result = await collection.findOneAndUpdate(
            { _id: new ObjectId(roadmapId), userId: new ObjectId(userId) },
            { $set: updateData },
            { returnDocument: "after" }
        );
        
        return result || null;
    }

    /**
     * Delete a roadmap
     */
    async deleteRoadmap(roadmapId: string, userId: string): Promise<boolean> {
        const collection = await getRoadmapsCollection();
        const progressCollection = await getUserProgressCollection();
        
        // Delete associated progress records
        await progressCollection.deleteMany({
            roadmapId: new ObjectId(roadmapId),
            userId: new ObjectId(userId)
        });
        
        const result = await collection.deleteOne({
            _id: new ObjectId(roadmapId),
            userId: new ObjectId(userId)
        });
        
        return result.deletedCount > 0;
    }

    /**
     * Calculate overall progress for a roadmap
     */
    async calculateProgress(roadmapId: string, userId: string): Promise<number> {
        const roadmap = await this.getRoadmap(roadmapId, userId);
        if (!roadmap) return 0;
        
        const totalModules = roadmap.stages.reduce((sum, stage) => sum + stage.modules.length, 0);
        if (totalModules === 0) return 0;
        
        const progressCollection = await getUserProgressCollection();
        const progressRecords = await progressCollection.find({
            roadmapId: new ObjectId(roadmapId),
            userId: new ObjectId(userId),
            status: "completed"
        }).toArray();
        
        const completedModules = new Set(progressRecords.map(p => p.moduleId)).size;
        const moduleProgress = (completedModules / totalModules) * 100;
        
        // Calculate resource-level progress for in-progress modules
        const inProgressModules = roadmap.stages
            .flatMap(s => s.modules)
            .filter(m => m.status === "in-progress");
        
        let resourceProgress = 0;
        for (const module of inProgressModules) {
            const moduleProgressRecord = progressRecords.find(p => p.moduleId === module.id);
            if (moduleProgressRecord) {
                resourceProgress += moduleProgressRecord.progress;
            } else {
                // Calculate from resource completion
                const completedResources = module.resources.filter(r => r.completed).length;
                const totalResources = module.resources.length;
                if (totalResources > 0) {
                    resourceProgress += (completedResources / totalResources) * 100;
                }
            }
        }
        
        const avgResourceProgress = inProgressModules.length > 0 
            ? resourceProgress / inProgressModules.length 
            : 0;
        
        // Weighted average: 80% module completion, 20% resource progress
        const overallProgress = (moduleProgress * 0.8) + (avgResourceProgress * 0.2);
        
        // Update roadmap with calculated progress
        await this.updateRoadmap(roadmapId, userId, { overallProgress });
        
        return Math.round(overallProgress);
    }

    /**
     * Update module status
     */
    async updateModuleStatus(
        roadmapId: string,
        userId: string,
        moduleId: string,
        status: "started" | "completed",
        progress?: number
    ): Promise<Roadmap | null> {
        const roadmap = await this.getRoadmap(roadmapId, userId);
        if (!roadmap) return null;
        
        // Find and update the module
        let moduleUpdated = false;
        for (const stage of roadmap.stages) {
            const module = stage.modules.find(m => m.id === moduleId);
            if (module) {
                if (status === "started") {
                    module.status = "in-progress";
                    module.startedAt = new Date();
                    module.progress = progress || 0;
                } else if (status === "completed") {
                    module.status = "completed";
                    module.completedAt = new Date();
                    module.progress = 100;
                } else if (progress !== undefined) {
                    module.progress = progress;
                }
                moduleUpdated = true;
                break;
            }
        }
        
        if (!moduleUpdated) return null;
        
        // Update prerequisites - unlock modules that depend on this one
        this.unlockPrerequisites(roadmap, moduleId);
        
        // Save progress record
        const progressCollection = await getUserProgressCollection();
        await progressCollection.updateOne(
            {
                roadmapId: new ObjectId(roadmapId),
                userId: new ObjectId(userId),
                moduleId: moduleId
            },
            {
                $set: {
                    roadmapId: new ObjectId(roadmapId),
                    userId: new ObjectId(userId),
                    moduleId: moduleId,
                    status: status,
                    progress: progress || (status === "completed" ? 100 : 0),
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    timeSpent: 0
                }
            },
            { upsert: true }
        );
        
        // Recalculate overall progress
        await this.calculateProgress(roadmapId, userId);
        
        // Update roadmap
        return this.updateRoadmap(roadmapId, userId, { stages: roadmap.stages });
    }

    /**
     * Update resource completion status
     */
    async updateResourceStatus(
        roadmapId: string,
        userId: string,
        moduleId: string,
        resourceId: string,
        completed: boolean
    ): Promise<Roadmap | null> {
        const roadmap = await this.getRoadmap(roadmapId, userId);
        if (!roadmap) return null;
        
        // Find and update the resource
        let resourceUpdated = false;
        for (const stage of roadmap.stages) {
            const module = stage.modules.find(m => m.id === moduleId);
            if (module) {
                const resource = module.resources.find(r => r.id === resourceId);
                if (resource) {
                    resource.completed = completed;
                    if (completed) {
                        resource.completedAt = new Date();
                    } else {
                        resource.completedAt = undefined;
                    }
                    resourceUpdated = true;
                    break;
                }
            }
        }
        
        if (!resourceUpdated) return null;
        
        // Update module progress based on resource completion
        for (const stage of roadmap.stages) {
            const module = stage.modules.find(m => m.id === moduleId);
            if (module) {
                const completedResources = module.resources.filter(r => r.completed).length;
                const totalResources = module.resources.length;
                module.progress = totalResources > 0 
                    ? Math.round((completedResources / totalResources) * 100)
                    : 0;
                
                // If all resources completed, mark module as completed and unlock next
                if (module.progress === 100 && module.status !== "completed") {
                    module.status = "completed";
                    module.completedAt = new Date();
                    this.unlockPrerequisites(roadmap, moduleId);
                }
                break;
            }
        }
        
        // Save progress record
        const progressCollection = await getUserProgressCollection();
        await progressCollection.updateOne(
            {
                roadmapId: new ObjectId(roadmapId),
                userId: new ObjectId(userId),
                moduleId: moduleId,
                resourceId: resourceId
            },
            {
                $set: {
                    roadmapId: new ObjectId(roadmapId),
                    userId: new ObjectId(userId),
                    moduleId: moduleId,
                    resourceId: resourceId,
                    status: completed ? "completed" : "started",
                    progress: completed ? 100 : 0,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdAt: new Date(),
                    timeSpent: 0
                }
            },
            { upsert: true }
        );
        
        // Recalculate overall progress
        await this.calculateProgress(roadmapId, userId);
        
        // Update roadmap
        return this.updateRoadmap(roadmapId, userId, { stages: roadmap.stages });
    }

    /**
     * Unlock modules that have prerequisites met, and the next module in order.
     * - Prerequisite-based: any locked module whose listed prerequisites (by id or by order) are all completed.
     * - Sequential: the immediately next module in roadmap order is unlocked when one completes.
     */
    private unlockPrerequisites(roadmap: Roadmap, completedModuleId: string): void {
        const allModulesOrdered = this.getModulesInOrder(roadmap);
        const completedIndex = allModulesOrdered.findIndex(m => m.id === completedModuleId);

        // 1. Unlock the next module in order (so completing one always unlocks the next)
        if (completedIndex >= 0 && completedIndex < allModulesOrdered.length - 1) {
            const nextModule = allModulesOrdered[completedIndex + 1];
            if (nextModule.status === "locked") {
                nextModule.status = "available";
            }
        }

        // 2. Unlock any locked module whose prerequisites are all completed (by id or by previous-in-order)
        for (const stage of roadmap.stages) {
            for (const module of stage.modules) {
                if (module.status !== "locked") continue;
                const prereqIds = module.prerequisites && module.prerequisites.length > 0
                    ? module.prerequisites
                    : null;
                if (!prereqIds) continue; // already handled by sequential unlock above

                const allPrerequisitesMet = prereqIds.every(prereqId => {
                    const prereqModule = this.findModuleById(roadmap, prereqId);
                    return prereqModule ? prereqModule.status === "completed" : false;
                });

                if (allPrerequisitesMet) {
                    module.status = "available";
                }
            }
        }
    }

    /** Get all modules in roadmap order (by stage order, then module order). */
    private getModulesInOrder(roadmap: Roadmap): RoadmapModule[] {
        const list: RoadmapModule[] = [];
        const stages = [...roadmap.stages].sort((a, b) => a.order - b.order);
        for (const stage of stages) {
            const modules = [...(stage.modules || [])].sort((a, b) => a.order - b.order);
            list.push(...modules);
        }
        return list;
    }

    private findModuleById(roadmap: Roadmap, id: string): RoadmapModule | null {
        for (const stage of roadmap.stages) {
            const m = stage.modules.find(mod => mod.id === id);
            if (m) return m;
        }
        return null;
    }

    /**
     * Get active roadmap for user
     */
    async getActiveRoadmap(userId: string): Promise<Roadmap | null> {
        const roadmaps = await this.getUserRoadmaps(userId, true);
        return roadmaps.length > 0 ? roadmaps[0] : null;
    }
}
