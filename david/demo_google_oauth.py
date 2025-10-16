"""Demo script for Google OAuth authentication.

This script demonstrates the Google OAuth integration in the david package.
It shows how to:
1. Initialize the AuthService and GoogleAuthProvider
2. Generate an authorization URL
3. Simulate authentication (with mock data)
"""

from david import GoogleAuthProvider, AuthService, InMemoryUserRepository
import os

def demo_google_oauth():
    """Demonstrate Google OAuth flow."""
    
    print("=" * 60)
    print("🔐 David Package - Google OAuth Demo")
    print("=" * 60)
    print()
    
    # 1. Initialize AuthService
    print("1️⃣  Initializing AuthService...")
    repo = InMemoryUserRepository()
    auth_service = AuthService(repo)
    print("   ✅ AuthService initialized")
    print()
    
    # 2. Initialize GoogleAuthProvider
    print("2️⃣  Setting up Google OAuth Provider...")
    client_id = os.getenv('GOOGLE_CLIENT_ID', 'demo-client-id.apps.googleusercontent.com')
    client_secret = os.getenv('GOOGLE_CLIENT_SECRET', 'demo-secret')
    
    google_auth = GoogleAuthProvider(
        auth_service=auth_service,
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri='http://localhost:3000/auth/google/callback'
    )
    print(f"   ✅ Google Client ID: {client_id[:20]}...")
    print()
    
    # 3. Generate authorization URL
    print("3️⃣  Generating Google authorization URL...")
    auth_url = google_auth.get_authorization_url(state='random_state_123')
    print(f"   🔗 Authorization URL:")
    print(f"   {auth_url[:80]}...")
    print()
    
    # 4. Show what happens after user authorizes
    print("4️⃣  After user authorizes on Google:")
    print("   → Google redirects to: http://localhost:3000/auth/google/callback?code=...")
    print("   → Server calls: google_auth.authenticate_with_code(code)")
    print("   → Result: LoginResult with access_token and user info")
    print()
    
    # 5. Demonstrate user creation
    print("5️⃣  Simulating user authentication (manual registration)...")
    print("   (In real flow, this happens automatically with Google data)")
    
    # Manually register a "Google user" with metadata
    from david.auth import PasswordHash
    
    user = auth_service.repo._users_by_email.get('demo@example.com')
    if not user:
        dummy_hash = PasswordHash(
            algorithm="google_oauth",
            salt="",
            iterations=0,
            hash="GOOGLE_OAUTH_USER"
        )
        
        from david.auth import User
        user = User(
            id=repo._next_id(),
            username='demouser',
            email='demo@example.com',
            password_hash=dummy_hash,
            roles={'user'},
            created_at=auth_service.clock.now(),
            metadata={
                'auth_provider': 'google',
                'google_id': '123456789',
                'google_name': 'Demo User',
                'google_picture': 'https://example.com/photo.jpg'
            }
        )
        repo.save(user)
        print(f"   ✅ Created user: {user.username}")
        print(f"   📧 Email: {user.email}")
        print(f"   🎫 User ID: {user.id}")
        print(f"   📊 Metadata: {user.metadata}")
    else:
        print(f"   ℹ️  User already exists: {user.username}")
    print()
    
    # 6. Generate access token for the user
    print("6️⃣  Generating access token...")
    access_token = auth_service._issue_access_token(user)
    print(f"   🎟️  Access Token: {access_token[:40]}...")
    print()
    
    # 7. Verify the token
    print("7️⃣  Verifying access token...")
    claims = auth_service.verify_access_token(access_token)
    print(f"   ✅ Token verified!")
    print(f"   👤 Username: {claims.username}")
    print(f"   🆔 User ID: {claims.user_id}")
    print(f"   🔑 Roles: {claims.roles}")
    print(f"   🔐 Permissions: {claims.permissions}")
    print()
    
    # 8. Test that Google users can't login with password
    print("8️⃣  Testing password login (should fail)...")
    from david.auth import InvalidCredentials
    try:
        auth_service.login('demouser', 'any_password')
        print("   ❌ ERROR: Should have failed!")
    except InvalidCredentials:
        print("   ✅ Correctly rejected password login for Google user")
    print()
    
    print("=" * 60)
    print("✨ Demo Complete!")
    print("=" * 60)
    print()
    print("📚 Next Steps:")
    print("   1. Get Google OAuth credentials from Google Cloud Console")
    print("   2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars")
    print("   3. Start the web server: npm start")
    print("   4. Visit: http://localhost:3000/login.html")
    print("   5. Click 'Bejelentkezés Google-lal' button")
    print()
    print("📖 Documentation: david/README.google_oauth.md")
    print()


if __name__ == '__main__':
    demo_google_oauth()
