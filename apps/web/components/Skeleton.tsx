import React from 'react';

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton ${className || ''}`} style={style} aria-busy="true" />;
}

export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 12,
            borderRadius: 6,
            marginTop: i === 0 ? 0 : 10,
            width: `${Math.max(30, 90 - i * 10)}%`,
          }}
        />
      ))}
    </div>
  );
}

