import { useState } from 'react'

/**
 * Drag-to-reorder for a table body, with buttons as the accessible path.
 *
 * Exposes the handlers rather than rendering the rows, because the mock and
 * contest lists show different columns and neither should have to bend to a
 * shared row component. Dragging is the fast way; the arrows are the one
 * that works with a keyboard and on a phone, where HTML5 drag does not fire
 * at all.
 */
export function useRowDrag(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  return {
    dragging,
    over,
    rowProps: (index: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragging(index)
        e.dataTransfer.effectAllowed = 'move'
        // Firefox ignores a drag that carries no payload.
        e.dataTransfer.setData('text/plain', String(index))
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (over !== index) setOver(index)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        const from = dragging ?? Number(e.dataTransfer.getData('text/plain'))
        if (Number.isInteger(from) && from !== index) onMove(from, index)
        setDragging(null); setOver(null)
      },
      onDragEnd: () => { setDragging(null); setOver(null) },
      className: `ord-row ${dragging === index ? 'dragging' : ''} ${over === index && dragging !== index ? 'over' : ''}`,
    }),
  }
}

export function MoveButtons({ index, total, onMove }: {
  index: number
  total: number
  onMove: (from: number, to: number) => void
}) {
  return (
    <span className="ord-moves">
      <button type="button" className="ord-btn" disabled={index === 0}
        title="Move up" aria-label="Move up" onClick={() => onMove(index, index - 1)}>↑</button>
      <button type="button" className="ord-btn" disabled={index === total - 1}
        title="Move down" aria-label="Move down" onClick={() => onMove(index, index + 1)}>↓</button>
    </span>
  )
}

export function DragHandle() {
  return <span className="ord-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
}
