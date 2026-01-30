import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn, signUp, signOut, getCurrentUser, confirmSignUp } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
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
  
  // Recipe state
  const [recipes, setRecipes] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [newRecipe, setNewRecipe] = useState({
    name: '',
    ingredients: '',
    directions: '',
    prepTime: ''
  });

  useEffect(() => {
    checkUser();
  }, []);

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
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email
          }
        }
      });
      setNeedsConfirmation(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmSignUp = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: confirmationCode
      });
      alert('Email confirmed! You can now sign in.');
      setNeedsConfirmation(false);
      setAuthMode('signin');
      setEmail('');
      setConfirmationCode('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await signIn({ username: email, password: password });
      await checkUser();
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message);
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

  const loadRecipes = async () => {
    try {
      // Using Amplify Data - adjust based on your schema
      const result = await client.models.Recipe.list();
      setRecipes(result.data || []);
    } catch (err) {
      console.error('Error loading recipes:', err);
    }
  };

  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    
    try {
      await client.models.Recipe.create({
        name: newRecipe.name,
        ingredients: newRecipe.ingredients,
        directions: newRecipe.directions,
        prepTime: newRecipe.prepTime
      });
      
      setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: '' });
      setShowCreateForm(false);
      loadRecipes();
    } catch (err) {
      setError('Error creating recipe: ' + err.message);
    }
  };

  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setNewRecipe({
      name: recipe.name,
      ingredients: recipe.ingredients,
      directions: recipe.directions,
      prepTime: recipe.prepTime || ''
    });
    setShowCreateForm(false);
    setError('');
  };

  const handleUpdateRecipe = async (e) => {
    e.preventDefault();
    
    try {
      await client.models.Recipe.update({
        id: editingRecipe.id,
        name: newRecipe.name,
        ingredients: newRecipe.ingredients,
        directions: newRecipe.directions,
        prepTime: newRecipe.prepTime
      });
      
      setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: '' });
      setEditingRecipe(null);
      loadRecipes();
    } catch (err) {
      setError('Error updating recipe: ' + err.message);
    }
  };

  const handleDeleteRecipe = async (recipeId, recipeName) => {
    if (!window.confirm(`Are you sure you want to delete "${recipeName}"?`)) {
      return;
    }
    
    try {
      await client.models.Recipe.delete({ id: recipeId });
      loadRecipes();
    } catch (err) {
      setError('Error deleting recipe: ' + err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingRecipe(null);
    setNewRecipe({ name: '', ingredients: '', directions: '', prepTime: '' });
    setError('');
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

          {error && <div className="error">{error}</div>}

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
              <button type="submit">Sign In</button>
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
              <button type="submit">Confirm Email</button>
              <button 
                type="button" 
                onClick={() => {
                  setNeedsConfirmation(false);
                  setEmail('');
                  setConfirmationCode('');
                }}
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
              <button type="submit">Sign Up</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header>
        <h1>🍳 My Recipes</h1>
        <button onClick={handleSignOut} className="sign-out-btn">Sign Out</button>
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
            disabled={editingRecipe}
          >
            {showCreateForm ? 'Cancel' : '+ New Recipe'}
          </button>
        </div>

        {(showCreateForm || editingRecipe) && (
          <form onSubmit={editingRecipe ? handleUpdateRecipe : handleCreateRecipe} className="recipe-form">
            <h2>{editingRecipe ? 'Edit Recipe' : 'Create New Recipe'}</h2>
            {error && <div className="error">{error}</div>}
            
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
              value={newRecipe.prepTime}
              onChange={(e) => setNewRecipe({...newRecipe, prepTime: parseInt(e.target.value) || ''})}
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
              <button type="submit" style={{ flex: 1 }}>
                {editingRecipe ? 'Update Recipe' : 'Save Recipe'}
              </button>
              {editingRecipe && (
                <button 
                  type="button" 
                  onClick={handleCancelEdit}
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
                    style={{ 
                      flex: 1, 
                      padding: '10px', 
                      background: '#667eea', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    onClick={() => handleDeleteRecipe(recipe.id, recipe.name)}
                    style={{ 
                      flex: 1, 
                      padding: '10px', 
                      background: '#dc3545', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
