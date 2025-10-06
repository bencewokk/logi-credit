/**
 * Simple test to verify authentication is working
 */

// Test admin credentials
const testCredentials = {
  username: 'admin',
  password: 'admin123'
};

async function testLogin() {
  console.log('🧪 Testing admin login...');
  
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCredentials)
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Login successful!');
      console.log('Token:', data.token);
      console.log('User:', data.user);
      
      // Test authenticated endpoint
      return testAuthenticatedEndpoint(data.token);
    } else {
      console.log('❌ Login failed:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    return false;
  }
}

async function testAuthenticatedEndpoint(token) {
  console.log('🧪 Testing authenticated endpoint...');
  
  try {
    const response = await fetch('http://localhost:3000/api/user', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Authenticated endpoint access successful!');
      console.log('User data:', data.user);
      return true;
    } else {
      console.log('❌ Authenticated endpoint failed:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    return false;
  }
}

async function testInvalidCredentials() {
  console.log('🧪 Testing invalid credentials...');
  
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'wrong',
        password: 'wrong'
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.log('✅ Invalid credentials correctly rejected!');
      return true;
    } else {
      console.log('❌ Invalid credentials were accepted (security issue!)');
      return false;
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting authentication tests...\n');
  
  const test1 = await testLogin();
  console.log('');
  
  const test2 = await testInvalidCredentials();
  console.log('');
  
  if (test1 && test2) {
    console.log('🎉 All tests passed! Authentication system is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Please check the implementation.');
  }
}

// Auto-run if this is loaded as a script
if (typeof window !== 'undefined') {
  // Browser environment
  document.addEventListener('DOMContentLoaded', runTests);
} else {
  // Node.js environment
  runTests();
}

module.exports = { testLogin, testInvalidCredentials, testAuthenticatedEndpoint };