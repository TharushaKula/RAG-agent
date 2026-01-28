/**
 * Quick test script for Roadmap Generation Agent
 * 
 * Usage:
 *   npx ts-node src/scripts/test-roadmap.ts
 * 
 * Make sure:
 *   1. Backend server is running (npm run dev)
 *   2. Ollama is running (ollama serve)
 *   3. MongoDB is connected
 */

import axios from 'axios';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
let authToken = '';

// Test user credentials
const TEST_USER = {
    email: `test-roadmap-${Date.now()}@example.com`,
    password: 'testpassword123',
    name: 'Roadmap Test User'
};

/**
 * Step 1: Sign up a test user
 */
async function signup() {
    console.log('📝 Step 1: Signing up test user...');
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/signup`, TEST_USER);
        authToken = response.data.token;
        console.log('✅ Signed up successfully');
        console.log(`   Token: ${authToken.substring(0, 20)}...`);
        return true;
    } catch (error: any) {
        if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
            // Try to login instead
            console.log('   User exists, trying to login...');
            return await login();
        }
        console.error('❌ Signup failed:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Step 2: Login
 */
async function login() {
    console.log('🔐 Step 2: Logging in...');
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: TEST_USER.email,
            password: TEST_USER.password
        });
        authToken = response.data.token;
        console.log('✅ Logged in successfully');
        return true;
    } catch (error: any) {
        console.error('❌ Login failed:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Step 3: Update user profile
 */
async function updateProfile() {
    console.log('👤 Step 3: Updating user profile...');
    try {
        await axios.patch(
            `${BASE_URL}/api/auth/profile`,
            {
                learningGoals: ['frontend development', 'react', 'typescript'],
                learningStyles: ['visual', 'hands-on'],
                timeAvailability: 'moderate'
            },
            {
                headers: { Authorization: `Bearer ${authToken}` }
            }
        );
        console.log('✅ Profile updated');
        return true;
    } catch (error: any) {
        console.error('❌ Profile update failed:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Step 4: Test profile-based roadmap generation
 */
async function testProfileRoadmap() {
    console.log('\n🛣️  Step 4: Testing Profile-Based Roadmap Generation...');
    console.log('   This may take 30-90 seconds...');
    
    const startTime = Date.now();
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/roadmap/generate`,
            { source: 'profile' },
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000 // 2 minutes timeout
            }
        );
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const roadmap = response.data.roadmap;
        
        console.log(`✅ Roadmap generated in ${duration}s`);
        console.log(`   Title: ${roadmap.title}`);
        console.log(`   Category: ${roadmap.category}`);
        console.log(`   Source: ${roadmap.source}`);
        console.log(`   Stages: ${roadmap.stages.length}`);
        
        // Count modules and resources
        let totalModules = 0;
        let totalResources = 0;
        roadmap.stages.forEach((stage: any) => {
            totalModules += stage.modules.length;
            stage.modules.forEach((module: any) => {
                totalResources += module.resources?.length || 0;
            });
        });
        
        console.log(`   Total Modules: ${totalModules}`);
        console.log(`   Total Resources: ${totalResources}`);
        console.log(`   Estimated Time: ${roadmap.estimatedCompletionTime}`);
        
        // Verify structure
        const hasResources = roadmap.stages.some((stage: any) =>
            stage.modules.some((module: any) => module.resources?.length > 0)
        );
        
        if (hasResources) {
            console.log('   ✅ Resources found');
        } else {
            console.log('   ⚠️  No resources found (may be normal if services unavailable)');
        }
        
        return roadmap._id;
    } catch (error: any) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ Roadmap generation failed after ${duration}s`);
        console.error('   Error:', error.response?.data || error.message);
        if (error.response?.data?.message) {
            console.error('   Details:', error.response.data.message);
        }
        return null;
    }
}

/**
 * Step 5: Get all roadmaps
 */
async function getAllRoadmaps() {
    console.log('\n📋 Step 5: Fetching all roadmaps...');
    try {
        const response = await axios.get(`${BASE_URL}/api/roadmap`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log(`✅ Found ${response.data.roadmaps.length} roadmap(s)`);
        response.data.roadmaps.forEach((r: any, i: number) => {
            console.log(`   ${i + 1}. ${r.title} (${r.category}) - ${r.source}`);
        });
        
        return response.data.roadmaps;
    } catch (error: any) {
        console.error('❌ Failed to fetch roadmaps:', error.response?.data || error.message);
        return [];
    }
}

/**
 * Step 6: Test roadmap retrieval
 */
async function testGetRoadmap(roadmapId: string) {
    console.log('\n🔍 Step 6: Testing roadmap retrieval...');
    try {
        const response = await axios.get(`${BASE_URL}/api/roadmap/${roadmapId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        const roadmap = response.data.roadmap;
        console.log('✅ Roadmap retrieved successfully');
        console.log(`   Title: ${roadmap.title}`);
        console.log(`   Progress: ${roadmap.overallProgress}%`);
        console.log(`   Active: ${roadmap.isActive}`);
        
        return true;
    } catch (error: any) {
        console.error('❌ Failed to retrieve roadmap:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Check if Ollama is running
 */
async function checkOllama() {
    console.log('🔍 Checking Ollama connection...');
    try {
        const response = await axios.get('http://127.0.0.1:11434/api/tags', {
            timeout: 5000
        });
        console.log('✅ Ollama is running');
        if (response.data.models && response.data.models.length > 0) {
            console.log(`   Available models: ${response.data.models.map((m: any) => m.name).join(', ')}`);
        }
        return true;
    } catch (error: any) {
        console.error('❌ Ollama is not running or not accessible');
        console.error('   Please start Ollama: ollama serve');
        return false;
    }
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🧪 Roadmap Generation Agent Test Suite\n');
    console.log('=' .repeat(50));
    
    // Check prerequisites
    const ollamaOk = await checkOllama();
    if (!ollamaOk) {
        console.log('\n⚠️  Warning: Ollama is not running. Roadmap generation will fail.');
        console.log('   Continue anyway? (Tests will fail but you can see the error handling)');
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Run tests
    const signedUp = await signup();
    if (!signedUp) {
        console.error('\n❌ Authentication failed. Cannot continue tests.');
        process.exit(1);
    }
    
    await updateProfile();
    
    const roadmapId = await testProfileRoadmap();
    
    if (roadmapId) {
        await testGetRoadmap(roadmapId);
    }
    
    await getAllRoadmaps();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Test suite completed!');
    console.log(`\nTest user: ${TEST_USER.email}`);
    console.log('You can use this user to test in the frontend as well.');
}

// Run tests
runTests().catch((error) => {
    console.error('\n❌ Test suite crashed:', error);
    process.exit(1);
});
