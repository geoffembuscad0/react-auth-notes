import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'

function formatGroup(dateStr) {
  const d = new Date(dateStr)
  const today = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const day = new Date(d); day.setHours(0,0,0,0)
  if (day.getTime() === today.getTime()) return 'Today'
  if (day.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function Notes({ user }) {
  const [notes, setNotes] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | bookmarked
  const [bookmarks, setBookmarks] = useState(new Set())
  const [selected, setSelected] = useState(null) // detail view
  const [editing, setEditing] = useState(null) // null = closed, {} = new, note = edit
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setNotes(data || [])
  }

  useEffect(() => { fetchNotes() }, [])

  const filtered = useMemo(() => {
    return notes.filter(n => {
      if (filter === 'bookmarked' && !bookmarks.has(n.id)) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
    })
  }, [notes, search, filter, bookmarks])

  // Group by Today / Yesterday / Date
  const groups = useMemo(() => {
    const map = new Map()
    filtered.forEach(n => {
      const g = formatGroup(n.created_at)
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(n)
    })
    return [...map.entries()]
  }, [filtered])

  const openNew = () => { setTitle(''); setContent(''); setEditing({}) }
  const openEdit = (note) => { setTitle(note.title || ''); setContent(note.content || ''); setEditing(note); setSelected(null) }

  const saveNote = async () => {
    if (!title.trim() && !content.trim()) return
    setSaving(true)
    if (editing?.id) {
      await supabase.from('notes').update({ title, content }).eq('id', editing.id)
    } else {
      await supabase.from('notes').insert([{ title, content, user_id: user.id }])
    }
    setSaving(false); setEditing(null); fetchNotes()
  }

  const deleteNote = async (id) => {
    if (!window.confirm('Delete this entry?')) return
    await supabase.from('notes').delete().eq('id', id)
    setSelected(null); fetchNotes()
  }

  const toggleBookmark = (e, id) => {
    e.stopPropagation()
    setBookmarks(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSignOut = async () => await supabase.auth.signOut()

  return (
    <div>
      {/* Header */}
      <header className="journal-header">
        <div className="journal-top-row">
          <button className="icon-btn" onClick={handleSignOut} title="Sign out">↩</button>
          <button className="icon-btn" onClick={openNew} title="New entry">＋</button>
        </div>
        <h1 className="journal-title">Journal</h1>
        <p className="journal-count">{notes.length} {notes.length === 1 ? 'Entry' : 'Entries'}</p>
        <input
          className="journal-search"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="journal-filters">
          <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Entries</button>
          <button className={`filter-pill ${filter === 'bookmarked' ? 'active' : ''}`} onClick={() => setFilter('bookmarked')}>Bookmarked</button>
        </div>
      </header>

      {/* Timeline */}
      <main className="journal-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>No Entries Yet</h2>
            <p>Tap + to write your first entry.<br />Reflect on your day, just like in Journal.</p>
          </div>
        ) : groups.map(([group, items]) => (
          <div key={group}>
            <div className="date-header">{group}</div>
            {items.map(note => (
              <button key={note.id} className="entry-card" onClick={() => setSelected(note)}>
                <div className="entry-meta">
                  <span className="entry-date">{formatTime(note.created_at)} • Manila</span>
                  <span className="entry-bookmark" onClick={e => toggleBookmark(e, note.id)}>
                    {bookmarks.has(note.id) ? '★' : '☆'}
                  </span>
                </div>
                <h2 className="entry-title">{note.title || 'Untitled'}</h2>
                <p className="entry-preview">{note.content || 'No content...'}</p>
                <div className="entry-readmore">Read more →</div>
              </button>
            ))}
          </div>
        ))}
      </main>

      <button className="fab" onClick={openNew}>＋</button>

      {/* Composer Sheet */}
      {editing && (
        <div className="sheet-overlay" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-top">
              <button className="cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button className="done" onClick={saveNote} disabled={saving || (!title.trim() && !content.trim())}>
                {saving ? 'Saving...' : 'Done'}
              </button>
            </div>
            <input
              className="sheet-title-input"
              placeholder="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
            <textarea
              className="sheet-body-input"
              placeholder="Write about today..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
            <div className="sheet-meta">
              <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
            </div>
          </div>
        </div>
      )}

      {/* Detail View */}
      {selected && (
        <div className="sheet-overlay" onClick={() => setSelected(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-top">
              <button className="cancel" onClick={() => setSelected(null)}>Back</button>
              <button className="done" onClick={() => toggleBookmark({ stopPropagation: () => {} }, selected.id)}>
                {bookmarks.has(selected.id) ? '★ Bookmarked' : '☆ Bookmark'}
              </button>
            </div>
            <p className="entry-date" style={{ marginBottom: 8 }}>{formatGroup(selected.created_at)} • {formatTime(selected.created_at)}</p>
            <h2 className="entry-title" style={{ fontSize: 26 }}>{selected.title || 'Untitled'}</h2>
            <p className="detail-body">{selected.content}</p>
            <div className="detail-actions">
              <button className="btn-secondary" onClick={() => openEdit(selected)}>Edit</button>
              <button className="btn-danger" onClick={() => deleteNote(selected.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}