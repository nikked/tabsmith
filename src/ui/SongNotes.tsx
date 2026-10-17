import type { Action } from '../core/edit.ts'
import type { Song } from '../core/model.ts'
import { Checklist } from './Checklist.tsx'

type Props = {
  readonly song: Song
  readonly dispatch: (action: Action) => void
  readonly focusTodo: boolean
  readonly onTodoFocused: () => void
}

/** What to sort out before next practice, and drafts not ready for the chart. */
export function SongNotes({ song, dispatch, focusTodo, onTodoFocused }: Props) {
  return (
    <div className="song-notes">
      <Checklist
        title="TODO"
        // Song todos carry no ids, so a row is known by its place.
        items={song.todos.map((todo, index) => ({ key: String(index), ...todo }))}
        onAdd={() => dispatch({ kind: 'addTodo' })}
        onText={(index, text) => dispatch({ kind: 'setTodoText', index, text })}
        onToggle={(index) => dispatch({ kind: 'toggleTodo', index })}
        onRemove={(index) => dispatch({ kind: 'removeTodo', index })}
        onClearDone={() => dispatch({ kind: 'clearDoneTodos' })}
        focusFirstOpen={focusTodo}
        onFocused={onTodoFocused}
      />
      <label className="ideas">
        <span className="checklist-title">Ideas</span>
        <textarea
          aria-label="Ideas"
          placeholder="Lyric drafts, riffs to try, anything not in the chart yet"
          rows={Math.max(2, song.ideas.split('\n').length + 1)}
          value={song.ideas}
          onChange={(event) => dispatch({ kind: 'setIdeas', ideas: event.target.value })}
        />
      </label>
    </div>
  )
}
