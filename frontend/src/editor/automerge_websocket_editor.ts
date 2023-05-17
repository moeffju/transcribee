import { useEffect, useMemo, useRef } from 'react';
import { Editor, createEditor } from 'slate';
import { withReact } from 'slate-react';
import { withAutomergeDoc } from 'slate-automerge-doc';
import * as Automerge from '@automerge/automerge';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { useDebugMode } from '../debugMode';

enum MessageSyncType {
  Change = 1,
  ChangeBacklogComplete = 2,
  FullDoc = 3,
}

export function useAutomergeWebsocketEditor(
  url: string | URL,
  { onInitialSyncComplete }: { onInitialSyncComplete: () => void },
): Editor {
  const debug = useDebugMode();

  const editor = useMemo(() => {
    const baseEditor = createEditor();
    const editorWithReact = withReact(baseEditor);
    return withAutomergeDoc(editorWithReact, Automerge.init());
  }, [url.toString()]);

  const wsRef = useRef<ReconnectingWebSocket | null>(null);
  useEffect(() => {
    const ws = new ReconnectingWebSocket(url.toString(), [], { debug });

    const onMessage = async (event: MessageEvent) => {
      const msg_data = new Uint8Array(await event.data.arrayBuffer());
      const msg_type = msg_data[0];
      const msg = msg_data.slice(1);
      if (msg_type === MessageSyncType.Change) {
        // skip own changes
        // TODO: filter own changes in backend?
        if (Automerge.decodeChange(msg).actor == Automerge.getActorId(editor.doc)) return;

        const [newDoc] = Automerge.applyChanges(editor.doc, [msg]);
        editor.setDoc(newDoc);
      } else if (msg_type === MessageSyncType.ChangeBacklogComplete) {
        console.log('All changes synced');
        onInitialSyncComplete();
      } else if (msg_type === MessageSyncType.FullDoc) {
        console.log('Received new document');
        editor.setDoc(Automerge.load(msg));
      }
    };
    ws.addEventListener('message', (msg) => {
      onMessage(msg);
    });

    wsRef.current = ws;

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [editor]);

  editor.onDocChange = (newDoc) => {
    const lastChange = Automerge.getLastLocalChange(newDoc);
    if (lastChange && wsRef.current) {
      wsRef.current.send(lastChange);
    }
  };

  return editor;
}