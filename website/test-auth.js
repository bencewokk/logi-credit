/**
 * Simple test to verify authentication is working
 */

// Test admin credentials
const testCredentials = {
  username: 'admin',
  password: 'admin123'
};

const DEFAULT_PORT = process.env.TEST_PORT || 3000;
const DEFAULT_BASE_URL = process.env.BASE_URL || `http://localhost:${DEFAULT_PORT}`;

async function testLogin(baseUrl = DEFAULT_BASE_URL) {
  console.log('🧪 Testing admin login...');
  
  try {
    const response = await fetch(`${baseUrl}/api/login`, {
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
  return testAuthenticatedEndpoint(data.token, baseUrl);
    } else {
      console.log('❌ Login failed:', data.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
    return false;
  }
}

async function testAuthenticatedEndpoint(token, baseUrl = DEFAULT_BASE_URL) {
  console.log('🧪 Testing authenticated endpoint...');
  
  try {
    const response = await fetch(`${baseUrl}/api/user`, {
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

async function testInvalidCredentials(baseUrl = DEFAULT_BASE_URL) {
  console.log('🧪 Testing invalid credentials...');
  
  try {
    const response = await fetch(`${baseUrl}/api/login`, {
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
async function runTests(baseUrl = DEFAULT_BASE_URL) {
  console.log('🚀 Starting authentication tests...\n');
  
  const test1 = await testLogin(baseUrl);
  console.log('');
  
  const test2 = await testInvalidCredentials(baseUrl);
  console.log('');
  
  if (test1 && test2) {
    console.log('🎉 All tests passed! Authentication system is working correctly.');
    return true;
  } else {
    console.log('⚠️ Some tests failed. Please check the implementation.');
    return false;
  }
}

// Auto-run if this is loaded as a script
if (typeof window !== 'undefined') {
  // Browser environment
  document.addEventListener('DOMContentLoaded', () => runTests(window.location.origin));
} else {
  // Node.js environment
  const app = require('./server');
  const port = DEFAULT_PORT;
  const baseUrl = DEFAULT_BASE_URL;

  const server = app.listen(port, async () => {
    try {
      const success = await runTests(baseUrl);
      if (!success) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });
}

module.exports = { testLogin, testInvalidCredentials, testAuthenticatedEndpoint, runTests };