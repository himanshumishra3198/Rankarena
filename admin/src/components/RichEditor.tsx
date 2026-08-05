import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import api from '../lib/api'

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0f172a']

// Math / common symbols, grouped. Plain Unicode characters that render
// natively for students once inserted into the question text.
const SYMBOL_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Greek', items: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', 'Σ', 'Ω', 'Π', 'Φ', 'Θ'] },
  { label: 'Operators', items: ['×', '÷', '±', '∓', '√', '∛', '∜', '∑', '∏', '∫', '∞', '∝', '≈', '≠', '≤', '≥', '≡', '°', '′', '″'] },
  { label: 'Geometry', items: ['△', '▭', '∠', '⊥', '∥', '∴', '∵', '→', '←', '↑', '↓', '↔', '⇒', '⇔', '∼', '≅'] },
  { label: 'Sets / Logic', items: ['∈', '∉', '⊂', '⊆', '⊃', '∪', '∩', '∅', '∀', '∃', '¬', '∧', '∨'] },
  { label: 'Fractions', items: ['½', '⅓', '⅔', '¼', '¾', '⅕', '⅛', '⅜'] },
  { label: 'Currency & misc', items: ['₹', '$', '€', '£', '¥', '%', '‰', '#', '∘', '·', '…'] },
]

/**
 * Storage format is inline HTML with <br> between lines — the shape the
 * students' renderer allowlists, and what every existing question already
 * holds. ProseMirror models lines as paragraphs, so flatten them on the way
 * out: paragraph boundaries become <br>, wrappers are dropped.
 */
export function toStorage(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html || ''
  const paras = Array.from(tmp.children).filter(el => el.tagName === 'P')
  const out = paras.length
    ? paras.map(p => p.innerHTML).join('<br>')
    : tmp.innerHTML
  // An untouched editor serialises to a single empty paragraph.
  return out === '<br>' ? '' : out
}

// Typing Enter inserts a line break rather than splitting into a new
// paragraph, so the document stays one block and the stored HTML stays flat.
const EnterAsBreak = Extension.create({
  name: 'enterAsBreak',
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.setHardBreak(),
      'Shift-Enter': () => this.editor.commands.setHardBreak(),
    }
  },
})

// Single-line fields (options) shouldn't accept line breaks at all.
const NoEnter = Extension.create({
  name: 'noEnter',
  addKeyboardShortcuts() {
    return { Enter: () => true, 'Shift-Enter': () => true }
  },
})

/** The exact extension set the editor runs on, so tests parse and serialise
 *  through the same schema the admin actually types into. */
export function buildExtensions(opts: { singleLine?: boolean; placeholder?: string } = {}) {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      heading: false,
      horizontalRule: false,
      code: false,
      codeBlock: false,
      strike: false,
      link: false,
      trailingNode: false,
    }),
    Subscript,
    Superscript,
    TextStyle,
    Color,
    Image.configure({ inline: true, allowBase64: false }),
    Placeholder.configure({ placeholder: opts.placeholder ?? '' }),
    opts.singleLine ? NoEnter : EnterAsBreak,
  ]
}

/**
 * Rich text editor for question content, built on TipTap (ProseMirror).
 *
 * The schema is deliberately narrow — bold, italic, underline, sub, sup,
 * colour, images and line breaks, and nothing else. Everything the toolbar can
 * produce is inside the allowlist the student renderer sanitises against, so
 * what an admin sees is what a student gets. Headings, lists, blockquotes and
 * code blocks are switched off rather than left enabled and stripped later.
 */
export function RichEditor({ value, onChange, placeholder, minHeight = 70, singleLine = false }: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  singleLine?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [showSymbols, setShowSymbols] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Guards the value->editor sync below so our own edits don't round-trip.
  const emitting = useRef(false)

  const editor = useEditor({
    extensions: buildExtensions({ singleLine, placeholder }),
    content: value || '',
    editorProps: {
      attributes: {
        class: 're-content input',
        style: singleLine ? '' : `min-height:${minHeight}px`,
      },
      // Paste an image → upload it. Paste anything else → plain text, so a
      // copy from Word can't smuggle in fonts, backgrounds or block markup.
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? [])
        const img = items.find(i => i.type.startsWith('image/'))
        if (img) {
          const file = img.getAsFile()
          if (file) { event.preventDefault(); uploadAndInsert(file); return true }
        }
        const text = event.clipboardData?.getData('text/plain')
        if (text) {
          event.preventDefault()
          editorRef.current?.commands.insertContent(
            singleLine ? text.replace(/\s*\n+\s*/g, ' ') : text
          )
          return true
        }
        return false
      },
      handleDrop: (_view, event) => {
        const file = Array.from((event as DragEvent).dataTransfer?.files ?? [])
          .find(f => f.type.startsWith('image/'))
        if (file) { event.preventDefault(); uploadAndInsert(file); return true }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      emitting.current = true
      onChange(toStorage(editor.getHTML()))
      // Cleared on the next tick, after the parent has re-rendered with the
      // new value, so the sync effect below can tell our own edit apart from
      // an external one (loading a question for editing, or a form reset).
      queueMicrotask(() => { emitting.current = false })
    },
  })

  // `editorProps` closes over the first render, so reach the live instance
  // through a ref rather than the stale `editor` binding.
  const editorRef = useRef<typeof editor>(null)
  editorRef.current = editor

  // External value changes (edit an existing question, reset the form) are
  // pushed in. Skipped while our own onUpdate is in flight, which would
  // otherwise reset the cursor to the start on every keystroke.
  useEffect(() => {
    if (!editor || emitting.current) return
    if (toStorage(editor.getHTML()) !== (value || '')) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  async function uploadAndInsert(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/admin/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      editorRef.current?.chain().focus().setImage({ src: res.data.url, alt: '' }).run()
    } catch {
      alert('Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) uploadAndInsert(f)
    e.target.value = ''
  }

  if (!editor) return <div className="rich-editor" />

  // `active` drives the pressed state — something the old execCommand toolbar
  // couldn't show reliably.
  const btn = (
    label: React.ReactNode,
    onClick: () => void,
    title: string,
    active = false,
    extra?: React.CSSProperties,
  ) => (
    <button
      type="button"
      title={title}
      className={`re-btn ${active ? 'active' : ''}`}
      style={extra}
      // Keeps the selection inside the editor when the button is clicked.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )

  const chain = () => editor.chain().focus()

  return (
    <div className="rich-editor">
      <div className="re-toolbar">
        {btn(<b>B</b>, () => chain().toggleBold().run(), 'Bold', editor.isActive('bold'))}
        {btn(<i>I</i>, () => chain().toggleItalic().run(), 'Italic', editor.isActive('italic'))}
        {btn(<u>U</u>, () => chain().toggleUnderline().run(), 'Underline', editor.isActive('underline'))}
        <span className="re-sep" />
        {btn(<span>x<sub>2</sub></span>, () => chain().toggleSubscript().run(), 'Subscript', editor.isActive('subscript'))}
        {btn(<span>x<sup>2</sup></span>, () => chain().toggleSuperscript().run(), 'Superscript', editor.isActive('superscript'))}
        <span className="re-sep" />
        {COLORS.map(c =>
          btn('A', () => chain().setColor(c).run(), `Colour ${c}`,
            editor.isActive('textStyle', { color: c }), { color: c, fontWeight: 800 })
        )}
        <span className="re-sep" />
        {btn('⌫', () => chain().unsetAllMarks().run(), 'Clear formatting')}
        <span className="re-sep" />
        <button
          type="button"
          title="Insert math symbol"
          className={`re-btn ${showSymbols ? 'active' : ''}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShowSymbols(s => !s)}
        >
          √x ▾
        </button>
        <button
          type="button"
          title="Insert image (or drag & drop / paste)"
          className="re-btn"
          onMouseDown={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '…' : '🖼'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />
      </div>

      {showSymbols && (
        <div className="re-symbols">
          {SYMBOL_GROUPS.map(g => (
            <div key={g.label} className="re-sym-group">
              <div className="re-sym-label">{g.label}</div>
              <div className="re-sym-grid">
                {g.items.map(s => (
                  <button
                    key={s}
                    type="button"
                    className="re-sym"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => chain().insertContent(s).run()}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  )
}
