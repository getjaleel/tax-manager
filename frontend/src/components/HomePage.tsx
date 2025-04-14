import React from 'react';
import { Box, Button, Container, Typography, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      // Get the auth URL from backend
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }

      const data = await response.json();
      
      if (!data.url) {
        throw new Error('Invalid response from server');
      }

      // Redirect to Google's OAuth page
      window.location.href = data.url;
    } catch (error) {
      console.error('Failed to get auth URL:', error);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom>
            Tax Manager
          </Typography>
          <Typography variant="body1" align="center" color="text.secondary" paragraph>
            Manage your taxes, expenses, and invoices in one place. Sign in to get started.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={handleLogin}
            sx={{ mt: 2 }}
          >
            Sign in with Google
          </Button>
        </Paper>
      </Box>
    </Container>
  );
};

export default HomePage; 