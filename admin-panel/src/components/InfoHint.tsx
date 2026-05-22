import type { ReactNode } from 'react';

type InfoHintProps = {
  text?: string;
  content?: ReactNode;
};

export const InfoHint = ({ text, content }: InfoHintProps) => (
  <details className="infoHint">
    <summary aria-label="Пояснение">(i)</summary>
    <div>{content ?? text}</div>
  </details>
);
