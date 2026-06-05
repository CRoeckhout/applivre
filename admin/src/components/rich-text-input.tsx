import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useReducer } from 'react';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';

// Éditeur WYSIWYG (TipTap) qui sérialise en markdown via tiptap-markdown.
// Utilisé pour tous les champs texte du fil d'actu / release notes : on stocke
// du markdown inline (**gras**, *italique*, [lien](url)), rendu côté app par
// components/rich-text.tsx.
//
// `multiline=false` (titres, sous-titres, items de liste) : un seul paragraphe,
// Entrée désactivée. `multiline=true` (paragraphes, citations) : sauts de ligne
// autorisés. Seules les marques inline sont activées — les blocs (titres,
// listes, citations) sont modélisés au niveau du BlockEditor, pas ici.

type Props = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  multiline?: boolean;
  // Active le sélecteur de taille (Normal / Titre / Grand titre) → niveaux de
  // titre markdown #/##. Réservé aux champs multi-lignes (bloc texte).
  withHeadings?: boolean;
};

function getMarkdown(storage: unknown): string {
  return (storage as MarkdownStorage)?.getMarkdown?.() ?? '';
}

export function RichTextInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  withHeadings = false,
}: Props) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: withHeadings ? { levels: [1, 2] } : false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true },
        // Mono-ligne : pas de saut de ligne dur.
        hardBreak: multiline ? undefined : false,
      }),
      Markdown.configure({ html: false, transformPastedText: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value || '',
    editorProps: {
      handleKeyDown: multiline
        ? undefined
        : (_view, event) => {
            // Mono-ligne : Entrée ne crée pas de nouveau paragraphe.
            if (event.key === 'Enter') {
              event.preventDefault();
              return true;
            }
            return false;
          },
    },
    onUpdate: ({ editor }) => {
      onChange(getMarkdown((editor.storage as unknown as Record<string, unknown>).markdown));
    },
  });

  // Réactivité des boutons de la barre (état actif) au fil des transactions.
  useEffect(() => {
    if (!editor) return;
    const update = () => forceUpdate();
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  // Resync quand la valeur change de l'extérieur (changement d'item édité,
  // reset du formulaire). emitUpdate=false pour ne pas reboucler sur onChange.
  useEffect(() => {
    if (!editor) return;
    const current = getMarkdown((editor.storage as unknown as Record<string, unknown>).markdown);
    if ((value || '').trim() !== current.trim()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const toggleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('URL du lien (https://… ou grimolia://…)');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className={`rte${multiline ? ' rte-multiline' : ''}`}>
      {/* Barre d'outils native TipTap : menu flottant affiché sur sélection. */}
      <BubbleMenu editor={editor} className="rte-bubble">
        {withHeadings && (
          <>
            <button
              type="button"
              className={`rte-btn${editor.isActive('paragraph') ? ' is-active' : ''}`}
              title="Texte normal"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setParagraph().run()}>
              ¶
            </button>
            <button
              type="button"
              className={`rte-btn${editor.isActive('heading', { level: 1 }) ? ' is-active' : ''}`}
              title="Grand titre"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              H1
            </button>
            <button
              type="button"
              className={`rte-btn${editor.isActive('heading', { level: 2 }) ? ' is-active' : ''}`}
              title="Titre"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              H2
            </button>
            <span className="rte-sep" />
          </>
        )}
        <button
          type="button"
          className={`rte-btn${editor.isActive('bold') ? ' is-active' : ''}`}
          title="Gras"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`rte-btn${editor.isActive('italic') ? ' is-active' : ''}`}
          title="Italique"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </button>
        <button
          type="button"
          className={`rte-btn${editor.isActive('link') ? ' is-active' : ''}`}
          title="Lien"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleLink}>
          🔗
        </button>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}
