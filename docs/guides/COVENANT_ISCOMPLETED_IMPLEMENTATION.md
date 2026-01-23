# Covenant IsCompleted Toggle - Frontend Implementation Guide

## Overview

All banking covenants now support an `IsCompleted` boolean toggle that allows users to manually mark covenants as completed. When marking a covenant as completed, users can optionally add a note for future reference.

## Supported Covenant Types

The `IsCompleted` toggle is available for all covenant types:
- **DSCR** covenants
- **Occupancy** covenants
- **Liquidity Requirement** covenants
- **I/O Maturity** covenants (auto-created from Construction loans)
- **Other** covenants

## API Endpoints

### Get Covenants
```javascript
// Get all covenants for a project
const covenants = await API.getCovenantsByProject(projectId);

// Get a specific covenant
const covenant = await API.getCovenantById(covenantId);
```

### Update Covenant IsCompleted
```javascript
// Mark covenant as completed with a note
await API.updateCovenant(covenantId, {
  IsCompleted: true,
  Notes: 'Completed on 2025-01-15. All requirements met.'
});

// Mark covenant as incomplete
await API.updateCovenant(covenantId, {
  IsCompleted: false
});

// Update only the note (preserve IsCompleted status)
await API.updateCovenant(covenantId, {
  Notes: 'Updated note text'
});
```

## Data Structure

Each covenant object includes:
```typescript
{
  CovenantId: number;
  ProjectId: number;
  LoanId: number | null;
  FinancingType: 'Construction' | 'Permanent' | null;
  CovenantType: 'DSCR' | 'Occupancy' | 'Liquidity Requirement' | 'I/O Maturity' | 'Other';
  IsCompleted: boolean;  // Default: false
  Notes: string | null;
  // ... other fields specific to covenant type
}
```

## UI Implementation

### 1. Display Covenant List

Show covenants with their completion status:

```jsx
function CovenantList({ projectId }) {
  const [covenants, setCovenants] = useState([]);
  
  useEffect(() => {
    loadCovenants();
  }, [projectId]);
  
  const loadCovenants = async () => {
    const response = await API.getCovenantsByProject(projectId);
    if (response.success) {
      setCovenants(response.data);
    }
  };
  
  return (
    <div className="covenant-list">
      {covenants.map(covenant => (
        <CovenantCard 
          key={covenant.CovenantId} 
          covenant={covenant}
          onUpdate={loadCovenants}
        />
      ))}
    </div>
  );
}
```

### 2. Covenant Card Component

Display each covenant with a toggle and optional note field:

```jsx
function CovenantCard({ covenant, onUpdate }) {
  const [isCompleted, setIsCompleted] = useState(covenant.IsCompleted);
  const [notes, setNotes] = useState(covenant.Notes || '');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const handleToggle = async (checked) => {
    setIsCompleted(checked);
    
    // If marking as completed, show note input
    if (checked) {
      setShowNoteInput(true);
    } else {
      // If unchecking, update immediately
      await updateCovenant({ IsCompleted: false });
    }
  };
  
  const handleSaveNote = async () => {
    setIsUpdating(true);
    try {
      await updateCovenant({
        IsCompleted: isCompleted,
        Notes: notes.trim() || null
      });
      setShowNoteInput(false);
      onUpdate(); // Refresh list
    } catch (error) {
      console.error('Failed to update covenant:', error);
      // Revert state on error
      setIsCompleted(covenant.IsCompleted);
      setNotes(covenant.Notes || '');
    } finally {
      setIsUpdating(false);
    }
  };
  
  const updateCovenant = async (updates) => {
    const response = await API.updateCovenant(covenant.CovenantId, updates);
    if (!response.success) {
      throw new Error(response.error?.message || 'Update failed');
    }
    return response.data;
  };
  
  const getCovenantDisplayName = () => {
    switch (covenant.CovenantType) {
      case 'DSCR':
        return `DSCR Test - ${covenant.DSCRTestDate || 'TBD'}`;
      case 'Occupancy':
        return `Occupancy - ${covenant.OccupancyCovenantDate || 'TBD'}`;
      case 'Liquidity Requirement':
        return 'Liquidity Requirement';
      case 'I/O Maturity':
        return `I/O Maturity - ${covenant.CovenantDate || 'TBD'}`;
      case 'Other':
        return covenant.Requirement || 'Other Covenant';
      default:
        return covenant.CovenantType;
    }
  };
  
  return (
    <div className={`covenant-card ${isCompleted ? 'completed' : ''}`}>
      <div className="covenant-header">
        <h3>{getCovenantDisplayName()}</h3>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={isUpdating}
          />
          <span className="toggle-label">
            {isCompleted ? 'Completed' : 'Pending'}
          </span>
        </label>
      </div>
      
      {/* Show note input when marking as completed */}
      {showNoteInput && isCompleted && (
        <div className="note-section">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note about completion (optional)..."
            rows={3}
            disabled={isUpdating}
          />
          <div className="note-actions">
            <button 
              onClick={handleSaveNote}
              disabled={isUpdating}
              className="btn-primary"
            >
              Save
            </button>
            <button 
              onClick={() => {
                setShowNoteInput(false);
                setIsCompleted(false);
                setNotes(covenant.Notes || '');
              }}
              disabled={isUpdating}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Display existing note if present */}
      {covenant.Notes && !showNoteInput && (
        <div className="existing-note">
          <strong>Note:</strong> {covenant.Notes}
          <button 
            onClick={() => setShowNoteInput(true)}
            className="btn-link"
          >
            Edit
          </button>
        </div>
      )}
      
      {/* Covenant details */}
      <div className="covenant-details">
        {/* Display relevant fields based on CovenantType */}
        {covenant.CovenantType === 'DSCR' && (
          <div>
            <p>Requirement: {covenant.DSCRRequirement}</p>
            <p>Projected: {covenant.ProjectedDSCR}</p>
          </div>
        )}
        {covenant.CovenantType === 'Occupancy' && (
          <div>
            <p>Requirement: {covenant.OccupancyRequirement}</p>
            <p>Projected: {covenant.ProjectedOccupancy}</p>
          </div>
        )}
        {/* Add other covenant type details as needed */}
      </div>
    </div>
  );
}
```

### 3. Alternative: Inline Edit Pattern

For a more compact UI, you can use an inline edit pattern:

```jsx
function CovenantCardInline({ covenant, onUpdate }) {
  const [isCompleted, setIsCompleted] = useState(covenant.IsCompleted);
  const [notes, setNotes] = useState(covenant.Notes || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const handleToggle = async (checked) => {
    const newCompleted = checked;
    setIsCompleted(newCompleted);
    
    // If marking as completed, prompt for note
    if (newCompleted && !notes) {
      setIsEditing(true);
    } else {
      // Update immediately
      await updateCovenant({ 
        IsCompleted: newCompleted,
        Notes: notes || null
      });
    }
  };
  
  const handleSave = async () => {
    setIsUpdating(true);
    try {
      await updateCovenant({
        IsCompleted: isCompleted,
        Notes: notes.trim() || null
      });
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update:', error);
    } finally {
      setIsUpdating(false);
    }
  };
  
  const updateCovenant = async (updates) => {
    const response = await API.updateCovenant(covenant.CovenantId, updates);
    if (!response.success) {
      throw new Error(response.error?.message || 'Update failed');
    }
    return response.data;
  };
  
  return (
    <div className="covenant-row">
      <div className="covenant-name">{getCovenantDisplayName(covenant)}</div>
      
      <div className="covenant-status">
        <label>
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={isUpdating}
          />
          Completed
        </label>
      </div>
      
      <div className="covenant-notes">
        {isEditing ? (
          <div className="note-edit">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add completion note..."
              onBlur={handleSave}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              autoFocus
            />
          </div>
        ) : (
          <div 
            className="note-display"
            onClick={() => setIsEditing(true)}
            title={notes || 'Click to add note'}
          >
            {notes || <span className="placeholder">Add note...</span>}
          </div>
        )}
      </div>
    </div>
  );
}
```

## Special Case: I/O Maturity Covenants

I/O Maturity covenants are **automatically created** when a Construction loan has an `IOMaturityDate`. These covenants:

- Are created automatically (no manual creation needed)
- Have `CovenantType = 'I/O Maturity'`
- Have `CovenantDate` set to the loan's `IOMaturityDate`
- Default to `IsCompleted = false`
- Can be updated like any other covenant

**Note:** If a Construction loan's `IOMaturityDate` is updated, the covenant date will be automatically updated, but `IsCompleted` and `Notes` are preserved.

## Styling Recommendations

```css
.covenant-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.covenant-card.completed {
  background-color: #f0f9ff;
  border-color: #3b82f6;
}

.covenant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-switch input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.note-section {
  margin-top: 12px;
  padding: 12px;
  background-color: #f9fafb;
  border-radius: 4px;
}

.note-section textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  resize: vertical;
}

.note-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.existing-note {
  margin-top: 12px;
  padding: 8px;
  background-color: #f9fafb;
  border-left: 3px solid #3b82f6;
  font-size: 14px;
}

.btn-link {
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  text-decoration: underline;
  margin-left: 8px;
}
```

## User Flow

1. **View Covenants**: User sees list of covenants with their current completion status
2. **Mark as Completed**: User checks the `IsCompleted` toggle
3. **Add Note (Optional)**: If marking as completed, UI prompts for optional note
4. **Save**: Note is saved along with completion status
5. **Edit Note**: User can edit existing notes by clicking "Edit"
6. **Uncheck**: User can uncheck to mark as incomplete

## Error Handling

```javascript
const handleUpdate = async (updates) => {
  try {
    setIsUpdating(true);
    const response = await API.updateCovenant(covenantId, updates);
    
    if (!response.success) {
      throw new Error(response.error?.message || 'Update failed');
    }
    
    // Show success message
    showNotification('Covenant updated successfully', 'success');
    return response.data;
  } catch (error) {
    // Show error message
    showNotification(error.message || 'Failed to update covenant', 'error');
    throw error;
  } finally {
    setIsUpdating(false);
  }
};
```

## Best Practices

1. **Optimistic Updates**: Update UI immediately, then sync with server
2. **Error Recovery**: Revert UI state if API call fails
3. **Loading States**: Show loading indicators during updates
4. **Validation**: Validate note length if you have limits
5. **Accessibility**: Use proper labels and ARIA attributes for checkboxes
6. **Mobile Responsive**: Ensure toggle and note input work well on mobile

## Example: Complete Implementation

```jsx
import { useState, useEffect } from 'react';
import API from '../api-client';

export default function CovenantsManager({ projectId }) {
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadCovenants();
  }, [projectId]);
  
  const loadCovenants = async () => {
    try {
      setLoading(true);
      const response = await API.getCovenantsByProject(projectId);
      if (response.success) {
        setCovenants(response.data);
      }
    } catch (error) {
      console.error('Failed to load covenants:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleToggleCompleted = async (covenantId, isCompleted, note) => {
    try {
      const response = await API.updateCovenant(covenantId, {
        IsCompleted: isCompleted,
        Notes: note || null
      });
      
      if (response.success) {
        // Update local state
        setCovenants(covenants.map(c => 
          c.CovenantId === covenantId 
            ? { ...c, IsCompleted: isCompleted, Notes: note || null }
            : c
        ));
      }
    } catch (error) {
      console.error('Failed to update covenant:', error);
      throw error;
    }
  };
  
  if (loading) return <div>Loading covenants...</div>;
  
  return (
    <div className="covenants-manager">
      <h2>Covenants</h2>
      {covenants.length === 0 ? (
        <p>No covenants found for this project.</p>
      ) : (
        covenants.map(covenant => (
          <CovenantCard
            key={covenant.CovenantId}
            covenant={covenant}
            onToggle={handleToggleCompleted}
          />
        ))
      )}
    </div>
  );
}
```

## Testing Checklist

- [ ] Toggle `IsCompleted` from false to true
- [ ] Toggle `IsCompleted` from true to false
- [ ] Add note when marking as completed
- [ ] Edit existing note
- [ ] Save note without marking as completed
- [ ] Handle API errors gracefully
- [ ] Test with all covenant types (DSCR, Occupancy, Liquidity, I/O Maturity, Other)
- [ ] Verify I/O Maturity covenants appear automatically
- [ ] Test on mobile devices
- [ ] Verify accessibility (keyboard navigation, screen readers)
