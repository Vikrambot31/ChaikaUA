type InfoHintProps = {
  text: string;
};

export const InfoHint = ({ text }: InfoHintProps) => (
  <details className="infoHint">
    <summary aria-label="Пояснение">(i)</summary>
    <div>{text}</div>
  </details>
);
