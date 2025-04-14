import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { CircularProgress, Box, Typography, Button } from '@mui/material';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let isProcessing = false;

    const handleCallback = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        // Get the authorization code from the URL
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        
        if (!code) {
          throw new Error('No authorization code received');
        }

        // Exchange the code for tokens
        const response = await fetch(`${API_BASE_URL}/auth/callback?code=${code}`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to exchange code for tokens');
        }

        const data = await response.json();
        
        if (isMounted) {
          // Store the tokens
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          // Redirect to dashboard
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Authentication error:', error);
        if (isMounted) {
          setError((error as Error).message);
          setIsLoading(false);
        }
      } finally {
        isProcessing = false;
      }
    };

    handleCallback();

    return () => {
      isMounted = false;
    };
  }, [navigate, location]);

  if (error) {
    return (
      <Box 
        display="flex" 
        flexDirection="column"
        justifyContent="center" 
        alignItems="center" 
        height="100vh"
        gap={2}
      >
        <Typography color="error" variant="h6">
          Authentication failed: {error}
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          Return to Home
        </Button>
      </Box>
    );
  }

  return (
    <Box 
      display="flex" 
      flexDirection="column"
      justifyContent="center" 
      alignItems="center" 
      height="100vh"
      gap={2}
    >
      <CircularProgress />
      <Typography>Completing authentication...</Typography>
    </Box>
  );
};

export default AuthCallback; 