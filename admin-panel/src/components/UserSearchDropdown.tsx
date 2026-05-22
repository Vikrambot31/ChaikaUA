import { useEffect, useRef, useState } from 'react';
import type { SearchResultItem } from '../types/guarantorTree';
import { maskPhone, shortUid } from '../services/guarantorTreeService';

type UserSearchDropdownProps = {
  onSelect: (uid: string, user: SearchResultItem) => void;
  searchFn: (query: string) => Promise<SearchResultItem[]>;
  loading?: boolean;
};

export const UserSearchDropdown = ({ onSelect, searchFn, loading }: UserSearchDropdownProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const runSearch = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    timerRef.current = setTimeout(() => {
      searchFn(value)
        .then((items) => {
          if (requestRef.current !== requestId) return;
          setResults(items);
          setOpen(true);
        })
        .catch(() => {
          if (requestRef.current === requestId) setResults([]);
        })
        .finally(() => {
          if (requestRef.current === requestId) setSearching(false);
        });
    }, 180);
  };

  return (
    <div className="user-search-dropdown" ref={wrapperRef}>
      <label className="search-input-wrapper">
        <span aria-hidden="true">🔍</span>
        <input
          className="search-input"
          type="search"
          value={query}
          disabled={loading}
          placeholder="+380 94... / bde82f4ac1..."
          onChange={(event) => runSearch(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {searching ? <span className="search-spinner" aria-label="Поиск" /> : null}
      </label>

      {open && results.length > 0 ? (
        <div className="search-dropdown" role="listbox">
          {results.map((user) => (
            <button key={user.uid} type="button" className="search-dropdown-item" onClick={() => { setQuery(user.name || user.uid); setOpen(false); onSelect(user.uid, user); }}>
              <span className="search-item-name">{user.name || 'Без имени'}</span>
              <span className="search-item-phone">{maskPhone(user.phone)}</span>
              <span className="search-item-uid">{shortUid(user.uid)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {open && query.trim().length >= 2 && !searching && results.length === 0 ? (
        <div className="search-dropdown search-dropdown-empty">Пользователь не найден. Проверьте номер телефона.</div>
      ) : null}
    </div>
  );
};
