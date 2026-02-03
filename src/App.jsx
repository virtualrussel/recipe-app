import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn, signUp, signOut, getCurrentUser, confirmSignUp } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import Toast from './Toast';
import { useToast } from './useToast';
import './App.css';

// Configure Amplify (will be populated by amplify configure)
// Amplify.configure(awsconfig);

const client = generateClient();

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastFailedOperation, setLastFailedOperation] = useState(null);
  const toast = useToast();
  
  // Recipe state
  const [recipes, setRecipes] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    ingredients: '',
    directions: '',
    prepTime: null
  });

  useEffect(() => {
    checkUser();
  }, []);

  // ============================================
  // ERROR RECOVERY HELPERS
  // ============================================

  // Helper to determine if error is retryable (network/timeout errors)
  const isRetryableError = (error) => {
    if (!error) return false;
    
    const retryableMessages = [
      'network',
      'timeout',
      'fetch',
      'connection',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Failed to fetch',
      'NetworkError'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retryableMessages.some(msg => errorMessage.includes(msg.toLowerCase()));
  };

  // Helper to get user-friendly error message
  const getUserFriendlyError = (error, operation) => {
    if (!error) return 'An unknown error occurred';
    
    const errorMsg = error.message || String(error);
    
    // Network errors
    if (isRetryableError(error)) {
      return `Network error during ${operation}. Retrying automatically...`;
    }
    
    // Auth errors
    if (errorMsg.includes('NotAuthorizedException')) {
      return 'Invalid email or password. Please try again.';
    }
    if (errorMsg.includes('UserNotFoundException')) {
      return 'User not found. Please check your email or sign up.';
    }
    if (errorMsg.includes('CodeMismatchException')) {
      return 'Invalid verification code. Please check and try again.';
    }
    if (errorMsg.includes('ExpiredCodeException')) {
      return 'Verification code expired. Please request a new one.';
    }
    if (errorMsg.includes('UsernameExistsException')) {
      return 'An account with this email already exists.';
    }
    if (errorMsg.includes('LimitExceededException')) {
      return 'Too many attempts. Please try again later.';
    }
    
    // Generic fallback
    return `Error during ${operation}: ${errorMsg}`;
  };

  // Retry with exponential backoff
  const retryOperation = async (operation, currentRetry = 0, maxRetries = 3) => {
    try {
      return await operation();
    } catch (error) {
      if (isRetryableError(error) && currentRetry < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, currentRetry), 5000); // Max 5 seconds
        console.log(`Retry attempt ${currentRetry + 1}/${maxRetries} after ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryOperation(operation, currentRetry + 1, maxRetries);
      }
      throw error;
    }
  };

  // Clear error
  const clearError = () => {
    setError('');
    setLastFailedOperation(null);
    setRetryCount(0);
  };

  // Manual retry handler
  const handleRetry = () => {
    if (lastFailedOperation) {
      setRetryCount(prev => prev + 1);
      clearError();
      lastFailedOperation();
    }
  };

  // ============================================
  // AUTHENTICATION
  // ============================================

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      loadRecipes();
    } catch {
      setUser(null);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearError();
    setIsLoading(true);
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      await retryOperation(async () => {
        return await signUp({
          username: email,
          password: password,
          options: {
            userAttributes: {
              email: email
            }
          }
        });
      });
      
      setNeedsConfirmation(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      const friendlyError = getUserFriendlyError(err, 'sign up');
      setError(friendlyError);
      setLastFailedOperation(() => () => {
        // Re-create the sign up call
        handleSignUp({ preventDefault: () => {} });
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async (e) => {
    e.preventDefault();
    clearError();
    setIsLoading(true);

    try {
      await retryOperation(async () => {
        return await confirmSignUp({
          username: email,
          confirmationCode: confirmationCode
        });
      });
      
      toast.success('Email confirmed! You can now sign in.');
      setNeedsConfirmation(false);
      setAuthMode('signin');
      setEmail('');
      setConfirmationCode('');
    } catch (err) {
      const friendlyError = getUserFriendlyError(err, 'email confirmation');
      setError(friendlyError);
      setLastFailedOperation(() => () => {
        handleConfirmSignUp({ preventDefault: () => {} });
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    clearError();
    setIsLoading(true);

    try {
      await retryOperation(async () => {
        return await signIn({ username: email, password: password });
      });
      
      await checkUser();
      toast.success('Welcome back!');
      setEmail('');
      setPassword('');
    } catch (err) {
      const friendlyError = getUserFriendlyError(err, 'sign in');
      setError(friendlyError);
      setLastFailedOperation(() => () => {
        handleSignIn({ preventDefault: () => {} });
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setRecipes([]);
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  // ============================================
  // RECIPE OPERATIONS
  // ============================================

  const loadRecipes = async (isRetry = false) => {
    if (!isRetry) {
      setIsLoading(true);
      clearError();
    }
    
    try {
      const result = await retryOperation(async () => {
        return await client.models.Recipe.list();
      });
      
      setRecipes(result.data || []);
      setRetryCount(0);
      setLastFailedOperation(null);
    } catch (err) {
      console.error('Error loading recipes:', err);
      const friendlyError = getUserFriendlyError(err, 'loading recipes');
      setError(friendlyError);
      setLastFailedOperation(() => loadRecipes);
    } finally {
      setIsLoading(false);
    }
  };

  // API function for creating recipe (separated from form handler)
  const createRecipeAPI = async (recipeData) => {
    return await retryOperation(async () => {
      return await client.models.Recipe.create(recipeData);
    });
  };

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    clearError();
    
    const recipeData = {
      name: newRecipe.name,
      ingredients: newRecipe.ingredients,
      directions: newRecipe.directions,
      prepTime: newRecipe.prepTime
    };
    
    try {
      await createRecipeAPI(recipeData);
      
      setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: null });
      setShowCreateForm(false);
      await loadRecipes(true);
      toast.success(`Recipe "${recipeData.name}" created successfully!`);
    } catch (err) {
      const friendlyError = getUserFriendlyError(err, 'creating recipe');
      setError(friendlyError);
      setIsLoading(false);
      setLastFailedOperation(() => async () => {
        setIsLoading(true);
        try {
          await createRecipeAPI(recipeData);
          setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: null });
          setShowCreateForm(false);
          await loadRecipes(true);
          toast.success(`Recipe "${recipeData.name}" created successfully!`);
        } catch (retryErr) {
          const retryError = getUserFriendlyError(retryErr, 'creating recipe');
          setError(retryError);
          setIsLoading(false);
        }
      });
    }
  };

  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setNewRecipe({
      name: recipe.name,
      ingredients: recipe.ingredients,
      directions: recipe.directions,
      prepTime: recipe.prepTime ?? null
    });
    setShowCreateForm(false);
    clearError();
  };

  // API function for updating recipe (separated from form handler)
  const updateRecipeAPI = async (id, recipeData) => {
    return await retryOperation(async () => {
      return await client.models.Recipe.update({
        id: id,
        ...recipeData
      });
    });
  };

  const handleUpdateRecipe = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    clearError();
    
    const recipeData = {
      name: newRecipe.name,
      ingredients: newRecipe.ingredients,
      directions: newRecipe.directions,
      prepTime: newRecipe.prepTime
    };
    
    const recipeId = editingRecipe.id;
    
    try {
      await updateRecipeAPI(recipeId, recipeData);
      
      setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: null });
      setEditingRecipe(null);
      await loadRecipes(true);
      toast.success(`Recipe "${recipeData.name}" updated successfully!`);
    } catch (err) {
      const friendlyError = getUserFriendlyError(err, 'updating recipe');
      setError(friendlyError);
      setIsLoading(false);
      setLastFailedOperation(() => async () => {
        setIsLoading(true);
        try {
          await updateRecipeAPI(recipeId, recipeData);
          setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: null });
          setEditingRecipe(null);
          await loadRecipes(true);
          toast.success(`Recipe "${recipeData.name}" updated successfully!`);
        } catch (retryErr) {
          const retryError = getUserFriendlyError(retryErr, 'updating recipe');
          setError(retryError);
          setIsLoading(false);
        }
      });
    }
  };

  // API function for deleting recipe
  const deleteRecipeAPI = async (recipeId) => {
    return await retryOperation(async () => {
      return await client.models.Recipe.delete({ id: recipeId });
    });
  };

  const handleDeleteRecipe = async (recipeId, recipeName) => {
    if (!window.confirm(`Are you sure you want to delete "${recipeName}"?`)) {
      return;
    }
    
    setIsLoading(true);
    clearError();
    
    try {
      await deleteRecipeAPI(recipeId);
      await loadRecipes(true);
      toast.success(`Recipe "${recipeName}" deleted successfully!`);
    } catch (err) {
      const friendlyError = getUserFriendlyError(err, 'deleting recipe');
      setError(friendlyError);
      setIsLoading(false);
      setLastFailedOperation(() => async () => {
        setIsLoading(true);
        try {
          await deleteRecipeAPI(recipeId);
          await loadRecipes(true);
          toast.success(`Recipe "${recipeName}" deleted successfully!`);
        } catch (retryErr) {
          const retryError = getUserFriendlyError(retryErr, 'deleting recipe');
          setError(retryError);
          setIsLoading(false);
        }
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingRecipe(null);
    setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: null });
    clearError();
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ============================================
  // RENDER - AUTH VIEW
  // ============================================

  if (!user) {
    return (
      <div className="App">
        <div className="auth-container">
          <h1>🍳 Recipe Manager</h1>
          
          <div className="auth-toggle">
            <button 
              className={authMode === 'signin' ? 'active' : ''}
              onClick={() => setAuthMode('signin')}
            >
              Sign In
            </button>
            <button 
              className={authMode === 'signup' ? 'active' : ''}
              onClick={() => setAuthMode('signup')}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="error">
              <span style={{ flex: 1 }}>{error}</span>
              <div style={{ display: 'flex', gap: '10px', marginLeft: '10px' }}>
                {lastFailedOperation && !isLoading && (
                  <button 
                    onClick={handleRetry}
                    className="error-retry-btn"
                  >
                    Retry
                  </button>
                )}
                <button 
                  onClick={clearError}
                  className="error-dismiss-btn"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {authMode === 'signin' ? (
            <form onSubmit={handleSignIn} className="auth-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : needsConfirmation ? (
            <form onSubmit={handleConfirmSignUp} className="auth-form">
              <p style={{ marginBottom: '15px', color: '#555' }}>
                Check your email for a verification code
              </p>
              <input
                type="text"
                placeholder="Verification Code"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                required
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Confirming...' : 'Confirm Email'}
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setNeedsConfirmation(false);
                  setEmail('');
                  setConfirmationCode('');
                  clearError();
                }}
                disabled={isLoading}
                style={{ background: '#6c757d', marginTop: '10px' }}
              >
                Back to Sign Up
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="auth-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Signing up...' : 'Sign Up'}
              </button>
            </form>
          )}
        </div>
        <Toast toasts={toast.toasts} removeToast={toast.removeToast} />
      </div>
    );
  }

  // ============================================
  // RENDER - MAIN APP
  // ============================================

  return (
    <div className="App">
      <header>
        <h1>🍳 My Recipes</h1>
        <button onClick={handleSignOut} className="sign-out-btn" disabled={isLoading}>
          Sign Out
        </button>
      </header>

      <div className="container">
        <div className="controls">
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button 
            onClick={() => {
              if (editingRecipe) {
                handleCancelEdit();
              }
              setShowCreateForm(!showCreateForm);
            }}
            className="create-btn"
            disabled={editingRecipe || isLoading}
          >
            {showCreateForm ? 'Cancel' : '+ New Recipe'}
          </button>
        </div>

        {(showCreateForm || editingRecipe) && (
          <form onSubmit={editingRecipe ? handleUpdateRecipe : handleCreateRecipe} className="recipe-form">
            <h2>{editingRecipe ? 'Edit Recipe' : 'Create New Recipe'}</h2>
            
            {error && (
              <div className="error">
                <span style={{ flex: 1 }}>{error}</span>
                <div style={{ display: 'flex', gap: '10px', marginLeft: '10px' }}>
                  {lastFailedOperation && !isLoading && (
                    <button 
                      type="button"
                      onClick={handleRetry}
                      className="error-retry-btn"
                    >
                      Retry
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={clearError}
                    className="error-dismiss-btn"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            
            <input
              type="text"
              placeholder="Recipe Name"
              value={newRecipe.name}
              onChange={(e) => setNewRecipe({...newRecipe, name: e.target.value})}
              required
            />
            
            <input
              type="number"
              placeholder="Prep Time (minutes)"
              value={newRecipe.prepTime ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setNewRecipe({
                  ...newRecipe, 
                  prepTime: value === '' ? null : parseInt(value, 10)
                });
              }}
              min="0"
            />
            
            <textarea
              placeholder="Ingredients (one per line with quantities)&#10;e.g., 2 cups flour&#10;1 tsp salt"
              value={newRecipe.ingredients}
              onChange={(e) => setNewRecipe({...newRecipe, ingredients: e.target.value})}
              rows="6"
              required
            />
            
            <textarea
              placeholder="Directions (step by step)&#10;1. Preheat oven...&#10;2. Mix ingredients..."
              value={newRecipe.directions}
              onChange={(e) => setNewRecipe({...newRecipe, directions: e.target.value})}
              rows="8"
              required
            />
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={{ flex: 1 }} disabled={isLoading}>
                {isLoading 
                  ? (editingRecipe ? 'Updating...' : 'Saving...') 
                  : (editingRecipe ? 'Update Recipe' : 'Save Recipe')
                }
              </button>
              {editingRecipe && (
                <button 
                  type="button" 
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                  style={{ flex: 1, background: '#6c757d' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        <div className="recipes-grid">
          {filteredRecipes.length === 0 ? (
            <p className="no-recipes">
              {searchTerm ? 'No recipes found.' : 'No recipes yet. Create your first one!'}
            </p>
          ) : (
            filteredRecipes.map((recipe) => (
              <div key={recipe.id} className="recipe-card">
                <h3>{recipe.name}</h3>
                {recipe.prepTime && (
                  <p style={{ color: '#888', fontSize: '14px', marginBottom: '15px' }}>
                    ⏱️ Prep time: {recipe.prepTime} minutes
                  </p>
                )}
                <div className="recipe-section">
                  <h4>Ingredients:</h4>
                  <pre>{recipe.ingredients}</pre>
                </div>
                <div className="recipe-section">
                  <h4>Directions:</h4>
                  <pre>{recipe.directions}</pre>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button 
                    onClick={() => handleEditRecipe(recipe)}
                    disabled={isLoading}
                    style={{ 
                      flex: 1, 
                      padding: '10px', 
                      background: '#667eea', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      opacity: isLoading ? 0.6 : 1
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    onClick={() => handleDeleteRecipe(recipe.id, recipe.name)}
                    disabled={isLoading}
                    style={{ 
                      flex: 1, 
                      padding: '10px', 
                      background: '#dc3545', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      opacity: isLoading ? 0.6 : 1
                    }}
                  >
                    {isLoading ? 'Deleting...' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <Toast toasts={toast.toasts} removeToast={toast.removeToast} />
    </div>
  );
}

export default App;
