'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface NoteAccount {
  id: string;
  name?: string;
  hebrewName?: string;
}

interface NoteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  accounts: NoteAccount[];
  isRtl: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  onTaggedAgentsChange?: (ids: string[]) => void;
}

export default function NoteTextarea({
  value,
  onChange,
  accounts,
  isRtl,
  placeholder,
  rows = 5,
  className = '',
  autoFocus,
  onTaggedAgentsChange,
}: NoteTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [taggedAgentIds, setTaggedAgentIds] = useState<string[]>([]);

  const getDisplayName = useCallback(
    (account: NoteAccount) => {
      if (isRtl) return account.hebrewName || account.name || '';
      return account.name || '';
    },
    [isRtl]
  );

  const filteredAccounts = mentionQuery
    ? accounts.filter((a) =>
        getDisplayName(a).toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : accounts;

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastAt = textBeforeCursor.lastIndexOf('@');
      if (lastAt >= 0) {
        const afterAt = textBeforeCursor.substring(lastAt + 1);
        if (!afterAt.includes('\n') && !afterAt.includes(' ') && afterAt.length < 30) {
          setMentionStartIndex(lastAt);
          setMentionQuery(afterAt);
          setShowDropdown(true);
          return;
        }
      }
      setShowDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(-1);
    },
    []
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      const cursorPos = e.target.selectionStart ?? newValue.length;
      detectMention(newValue, cursorPos);
    },
    [onChange, detectMention]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      detectMention(el.value, el.selectionStart ?? el.value.length);
    },
    [detectMention]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      detectMention(el.value, el.selectionStart ?? el.value.length);
    },
    [detectMention]
  );

  const selectAgent = useCallback(
    (account: NoteAccount) => {
      if (mentionStartIndex < 0) return;
      const displayName = getDisplayName(account);
      const before = value.substring(0, mentionStartIndex);
      const textarea = textareaRef.current;
      const cursorPos = textarea?.selectionStart ?? value.length;
      const after = value.substring(cursorPos);
      const insertion = `@${displayName} `;
      const newText = `${before}${insertion}${after}`;
      onChange(newText);

      // Track tagged agent
      const newTagged = taggedAgentIds.includes(account.id)
        ? taggedAgentIds
        : [...taggedAgentIds, account.id];
      setTaggedAgentIds(newTagged);
      onTaggedAgentsChange?.(newTagged);

      setShowDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(-1);

      // Place cursor after insertion
      requestAnimationFrame(() => {
        if (textarea) {
          const newCursorPos = before.length + insertion.length;
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [mentionStartIndex, value, getDisplayName, onChange, taggedAgentIds, onTaggedAgentsChange]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        placeholder={placeholder}
        rows={rows}
        className={className}
        autoFocus={autoFocus}
      />
      {showDropdown && filteredAccounts.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-xl bg-mgsr-card border border-mgsr-border shadow-xl"
        >
          {filteredAccounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className="w-full px-4 py-2.5 text-start text-sm text-mgsr-text hover:bg-mgsr-teal/10 transition flex items-center gap-2"
              onClick={() => selectAgent(account)}
            >
              <svg
                className="w-4 h-4 text-mgsr-teal shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>{getDisplayName(account)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
