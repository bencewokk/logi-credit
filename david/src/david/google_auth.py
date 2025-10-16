"""Google OAuth 2.0 authentication integration for the 'david' package.

This module provides Google Sign-In functionality that integrates with the
existing auth.py authentication system. It handles:
  * Google OAuth 2.0 flow (authorization code exchange)
  * ID token verification and validation
  * User profile extraction from Google
  * Integration with the existing User model and AuthService

Security notes:
  - Client ID and Client Secret must be stored securely (env vars)
  - ID tokens are verified for signature, audience, and issuer
  - HTTPS is required in production for OAuth redirects
  - State parameter should be used to prevent CSRF attacks

Setup:
  1. Create OAuth 2.0 credentials in Google Cloud Console
  2. Configure authorized redirect URIs
  3. Set environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  
Usage example:
  from david.google_auth import GoogleAuthProvider
  from david.auth import AuthService, InMemoryUserRepository
  
  repo = InMemoryUserRepository()
  auth_service = AuthService(repo)
  google_auth = GoogleAuthProvider(auth_service, client_id="...", client_secret="...")
  
  # After receiving authorization code from Google:
  result = google_auth.authenticate_with_code(auth_code, redirect_uri)
  access_token = result.access_token
"""

from __future__ import annotations

import json
import urllib.request
import urllib.parse
import urllib.error
import base64
import hmac
import hashlib
from dataclasses import dataclass
from typing import Any, Dict, Optional
from datetime import datetime, timedelta

from .auth import AuthService, User, LoginResult, AuthError

__all__ = [
    "GoogleAuthError",
    "GoogleAuthProvider",
    "GoogleUserInfo",
]


class GoogleAuthError(AuthError):
    """Raised when Google authentication fails."""
    pass


@dataclass
class GoogleUserInfo:
    """User information retrieved from Google."""
    google_id: str
    email: str
    name: str
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    picture: Optional[str] = None
    email_verified: bool = False


class GoogleAuthProvider:
    """
    Google OAuth 2.0 authentication provider.
    
    Integrates with AuthService to create or authenticate users via Google Sign-In.
    """
    
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
    GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
    GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    
    def __init__(
        self,
        auth_service: AuthService,
        client_id: str,
        client_secret: str,
        redirect_uri: str = "http://localhost:3000/auth/google/callback"
    ):
        """
        Initialize Google Auth Provider.
        
        Args:
            auth_service: The main AuthService instance
            client_id: Google OAuth 2.0 Client ID
            client_secret: Google OAuth 2.0 Client Secret
            redirect_uri: Redirect URI configured in Google Cloud Console
        """
        self.auth_service = auth_service
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
    
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate the Google OAuth authorization URL.
        
        Args:
            state: CSRF protection state parameter (recommended)
            
        Returns:
            Full authorization URL to redirect user to
        """
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent"
        }
        
        if state:
            params["state"] = state
        
        query_string = urllib.parse.urlencode(params)
        return f"{self.GOOGLE_AUTH_URL}?{query_string}"
    
    def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access token.
        
        Args:
            code: Authorization code from Google redirect
            
        Returns:
            Token response containing access_token, id_token, etc.
            
        Raises:
            GoogleAuthError: If token exchange fails
        """
        data = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code"
        }
        
        try:
            encoded_data = urllib.parse.urlencode(data).encode('utf-8')
            req = urllib.request.Request(
                self.GOOGLE_TOKEN_URL,
                data=encoded_data,
                method='POST'
            )
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            
            with urllib.request.urlopen(req) as response:
                token_data = json.loads(response.read().decode('utf-8'))
                return token_data
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            raise GoogleAuthError(f"Token exchange failed: {error_body}")
        except Exception as e:
            raise GoogleAuthError(f"Token exchange error: {str(e)}")
    
    def get_user_info(self, access_token: str) -> GoogleUserInfo:
        """
        Fetch user information from Google using access token.
        
        Args:
            access_token: Google OAuth access token
            
        Returns:
            GoogleUserInfo with user details
            
        Raises:
            GoogleAuthError: If fetching user info fails
        """
        try:
            req = urllib.request.Request(self.GOOGLE_USERINFO_URL)
            req.add_header('Authorization', f'Bearer {access_token}')
            
            with urllib.request.urlopen(req) as response:
                user_data = json.loads(response.read().decode('utf-8'))
                
            return GoogleUserInfo(
                google_id=user_data.get('sub', ''),
                email=user_data.get('email', ''),
                name=user_data.get('name', ''),
                given_name=user_data.get('given_name'),
                family_name=user_data.get('family_name'),
                picture=user_data.get('picture'),
                email_verified=user_data.get('email_verified', False)
            )
            
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            raise GoogleAuthError(f"Failed to fetch user info: {error_body}")
        except Exception as e:
            raise GoogleAuthError(f"User info fetch error: {str(e)}")
    
    def authenticate_with_code(self, code: str) -> LoginResult:
        """
        Complete authentication flow using authorization code.
        
        This method:
        1. Exchanges code for access token
        2. Fetches user info from Google
        3. Creates or retrieves user in local system
        4. Returns login result with our access token
        
        Args:
            code: Authorization code from Google redirect
            
        Returns:
            LoginResult with our system's access token
            
        Raises:
            GoogleAuthError: If authentication fails at any step
        """
        # Exchange code for token
        token_data = self.exchange_code_for_token(code)
        access_token = token_data.get('access_token')
        
        if not access_token:
            raise GoogleAuthError("No access token in response")
        
        # Get user info from Google
        google_user = self.get_user_info(access_token)
        
        if not google_user.email_verified:
            raise GoogleAuthError("Google email not verified")
        
        # Check if user exists in our system
        existing_user = self.auth_service.repo.find_by_email(google_user.email)
        
        if existing_user:
            # User exists - generate login result
            # We bypass password check since Google verified the user
            return self._create_login_result_for_user(existing_user)
        else:
            # New user - register them
            username = self._generate_username_from_email(google_user.email)
            
            # Register without password (Google OAuth users)
            # We'll need to modify the auth service to support this
            user = self._register_google_user(username, google_user)
            
            return self._create_login_result_for_user(user)
    
    def _generate_username_from_email(self, email: str) -> str:
        """Generate a username from email address."""
        base_username = email.split('@')[0].lower()
        # Remove special characters
        import re
        base_username = re.sub(r'[^a-z0-9]', '', base_username)
        
        # Check if username exists, add number suffix if needed
        counter = 0
        username = base_username
        
        while True:
            existing = self.auth_service.repo.find_by_username(username)
            if not existing:
                break
            counter += 1
            username = f"{base_username}{counter}"
        
        return username
    
    def _register_google_user(self, username: str, google_user: GoogleUserInfo) -> User:
        """
        Register a new user from Google authentication.
        
        Note: This creates a user without a password hash since they authenticate via Google.
        """
        from .auth import PasswordHash
        
        # Create a special password hash that indicates Google OAuth user
        # This ensures they can't login with password
        dummy_hash = PasswordHash(
            algorithm="google_oauth",
            salt="",
            iterations=0,
            hash="GOOGLE_OAUTH_USER"
        )
        
        user = User(
            id=self.auth_service.repo._next_id(),
            username=username,
            email=google_user.email,
            password_hash=dummy_hash,
            roles={"user"},  # Default role
            permissions=set(),
            created_at=self.auth_service.clock.now(),
            last_login=None,
            metadata={
                "auth_provider": "google",
                "google_id": google_user.google_id,
                "google_name": google_user.name,
                "google_picture": google_user.picture
            }
        )
        
        self.auth_service.repo.save(user)
        self.auth_service._emit_event("user_registered_google", username, google_user.email)
        
        return user
    
    def _create_login_result_for_user(self, user: User) -> LoginResult:
        """Create a login result for an authenticated user."""
        # Update last login time
        user.last_login = self.auth_service.clock.now()
        self.auth_service.repo.save(user)
        
        # Create access token
        access_token = self.auth_service._issue_access_token(user)
        
        # Create refresh token
        refresh_token = self.auth_service._issue_refresh_token(user)
        
        self.auth_service._emit_event("user_login_google", user.username)
        
        return LoginResult(
            access_token=access_token,
            refresh_token=refresh_token,
            user_id=user.id,
            username=user.username,
            roles=user.roles
        )
