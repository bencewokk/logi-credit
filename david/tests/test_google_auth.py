"""Tests for Google OAuth authentication integration."""

import pytest
from david.google_auth import GoogleAuthProvider, GoogleAuthError, GoogleUserInfo
from david.auth import AuthService, InMemoryUserRepository, AuthConfig


class MockGoogleAuthProvider(GoogleAuthProvider):
    """Mock Google Auth Provider for testing without actual Google API calls."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.mock_token_response = None
        self.mock_user_info = None
    
    def exchange_code_for_token(self, code: str):
        """Mock token exchange."""
        if self.mock_token_response:
            return self.mock_token_response
        return {
            "access_token": "mock_access_token_123",
            "refresh_token": "mock_refresh_token_456",
            "id_token": "mock_id_token_789",
            "expires_in": 3600
        }
    
    def get_user_info(self, access_token: str):
        """Mock user info retrieval."""
        if self.mock_user_info:
            return self.mock_user_info
        return GoogleUserInfo(
            google_id="123456789",
            email="test@example.com",
            name="Test User",
            given_name="Test",
            family_name="User",
            picture="https://example.com/photo.jpg",
            email_verified=True
        )


@pytest.fixture
def auth_service():
    """Create a fresh AuthService for each test."""
    repo = InMemoryUserRepository()
    return AuthService(repo)


@pytest.fixture
def google_provider(auth_service):
    """Create a mock Google Auth Provider."""
    return MockGoogleAuthProvider(
        auth_service=auth_service,
        client_id="test_client_id",
        client_secret="test_client_secret",
        redirect_uri="http://localhost:3000/auth/google/callback"
    )


def test_google_provider_initialization(google_provider):
    """Test that Google provider initializes correctly."""
    assert google_provider.client_id == "test_client_id"
    assert google_provider.client_secret == "test_client_secret"
    assert google_provider.redirect_uri == "http://localhost:3000/auth/google/callback"


def test_get_authorization_url(google_provider):
    """Test authorization URL generation."""
    url = google_provider.get_authorization_url(state="test_state_123")
    
    assert "https://accounts.google.com/o/oauth2/v2/auth" in url
    assert "client_id=test_client_id" in url
    assert "state=test_state_123" in url
    assert "scope=openid+email+profile" in url or "scope=openid%20email%20profile" in url
    assert "response_type=code" in url


def test_authenticate_with_code_new_user(google_provider):
    """Test authentication with a new Google user."""
    # Authenticate with mock code
    result = google_provider.authenticate_with_code("mock_auth_code_123")
    
    # Check that login result is returned
    assert result is not None
    assert result.access_token is not None
    assert result.refresh_token is not None
    assert result.username == "test"  # Generated from test@example.com
    
    # Check that user was created in repository
    user = google_provider.auth_service.repo.find_by_email("test@example.com")
    assert user is not None
    assert user.email == "test@example.com"
    assert user.metadata.get("auth_provider") == "google"
    assert user.metadata.get("google_id") == "123456789"


def test_authenticate_with_code_existing_user(google_provider):
    """Test authentication with an existing Google user."""
    # First authentication - creates user
    result1 = google_provider.authenticate_with_code("mock_auth_code_123")
    user_id_1 = result1.user_id
    
    # Second authentication - should use existing user
    result2 = google_provider.authenticate_with_code("mock_auth_code_456")
    user_id_2 = result2.user_id
    
    # Should be the same user
    assert user_id_1 == user_id_2
    
    # Check that only one user exists with this email
    repo = google_provider.auth_service.repo
    all_users = list(repo._users.values())
    users_with_email = [u for u in all_users if u.email == "test@example.com"]
    assert len(users_with_email) == 1


def test_authenticate_unverified_email(google_provider):
    """Test that unverified email is rejected."""
    # Set up mock to return unverified email
    google_provider.mock_user_info = GoogleUserInfo(
        google_id="999",
        email="unverified@example.com",
        name="Unverified User",
        email_verified=False
    )
    
    # Should raise error
    with pytest.raises(GoogleAuthError, match="email not verified"):
        google_provider.authenticate_with_code("mock_code")


def test_username_generation_collision(google_provider):
    """Test username generation handles collisions."""
    # Create a user with username "test"
    google_provider.auth_service.register_user(
        "test", 
        "other@example.com", 
        "StrongP@ssw0rd123!"
    )
    
    # Now authenticate with Google user test@example.com
    result = google_provider.authenticate_with_code("mock_code")
    
    # Username should be "test1" due to collision
    assert result.username == "test1"


def test_google_user_has_correct_metadata(google_provider):
    """Test that Google users have correct metadata."""
    result = google_provider.authenticate_with_code("mock_code")
    
    user = google_provider.auth_service.repo.find_by_username(result.username)
    
    assert user.metadata["auth_provider"] == "google"
    assert user.metadata["google_id"] == "123456789"
    assert user.metadata["google_name"] == "Test User"
    assert user.metadata["google_picture"] == "https://example.com/photo.jpg"


def test_google_user_cannot_login_with_password(google_provider, auth_service):
    """Test that Google OAuth users cannot login with password."""
    # Create Google user
    result = google_provider.authenticate_with_code("mock_code")
    
    # Try to login with password - should fail
    from david.auth import InvalidCredentials
    with pytest.raises(InvalidCredentials):
        auth_service.login(result.username, "any_password")


def test_token_exchange_error_handling(google_provider):
    """Test error handling when token exchange fails."""
    # Set up mock to return error
    google_provider.mock_token_response = None
    
    # Override exchange method to raise error
    def failing_exchange(code):
        raise GoogleAuthError("Token exchange failed")
    
    google_provider.exchange_code_for_token = failing_exchange
    
    # Should propagate the error
    with pytest.raises(GoogleAuthError, match="Token exchange failed"):
        google_provider.authenticate_with_code("bad_code")


def test_user_info_retrieval_error(google_provider):
    """Test error handling when user info retrieval fails."""
    # Override get_user_info to raise error
    def failing_user_info(token):
        raise GoogleAuthError("Failed to fetch user info")
    
    google_provider.get_user_info = failing_user_info
    
    # Should propagate the error
    with pytest.raises(GoogleAuthError, match="Failed to fetch user info"):
        google_provider.authenticate_with_code("mock_code")


def test_access_token_contains_google_metadata(google_provider):
    """Test that issued access token can be verified and contains user data."""
    result = google_provider.authenticate_with_code("mock_code")
    
    # Verify the access token
    claims = google_provider.auth_service.verify_access_token(result.access_token)
    
    assert claims is not None
    assert claims.user_id == result.user_id
    assert claims.username == result.username
    assert "user" in claims.roles


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
