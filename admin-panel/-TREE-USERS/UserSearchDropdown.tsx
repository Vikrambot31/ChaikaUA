import { useState, useCallback, useRef, useEffect } from 'react';
import type { UserProfile } from './types';

type UserSearchDropdownProps = {
  onSelect: (uid: string, user: UserProfile) => void;
  searchFn: (query: string) => Promise<UserProfile[]>;
  loading?: boolean;
};

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}***`;
  return phone;
};

export const UserSearchDropdown = ({ onSelect, searchFn, loading }: UserSearchDropdownProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await searchFn(value);
        setResults(data);
        setIsOpen(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [searchFn]);

  const handleSelect = useCallback((user: UserProfile) => {
    setQuery(user.name || user.uid);
    setIsOpen(false);
    onSelect(user.uid, user);
  }, [onSelect]);

  return (
    <div className="user-search-dropdown" ref={wrapperRef}>
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по телефону или UID"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {searching && <span className="search-spinner" />}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((user) => (
            <li
              key={user.uid}
              className="search-dropdown-item"
              onClick={() => handleSelect(user)}
            >
              <span className="search-item-name">{user.name || 'Без имени'}</span>
              <span className="search-item-phone">{maskPhone(user.phone)}</span>
              <span className="search-item-uid">{user.uid.slice(0, 8)}...</span>
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.trim().length >= 2 && !searching && results.length === 0 && (
        <div className="search-dropdown search-dropdown-empty">
          Пользователь не найден. Проверьте номер телефона.
        </div>
      )}
    </div>
  );
};
