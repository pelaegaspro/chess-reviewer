import React from 'react';

export const pieceFileMap: Record<string, string> = {
  wP: '/pieces/neo/wp.png',
  wN: '/pieces/neo/wn.png',
  wB: '/pieces/neo/wb.png',
  wR: '/pieces/neo/wr.png',
  wQ: '/pieces/neo/wq.png',
  wK: '/pieces/neo/wk.png',
  bP: '/pieces/neo/bp.png',
  bN: '/pieces/neo/bn.png',
  bB: '/pieces/neo/bb.png',
  bR: '/pieces/neo/br.png',
  bQ: '/pieces/neo/bq.png',
  bK: '/pieces/neo/bk.png'
};

export const neoCustomPieces: Record<string, (props?: any) => React.JSX.Element> = {};

Object.entries(pieceFileMap).forEach(([piece, src]) => {
  neoCustomPieces[piece] = (props?: any) => (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <img
        src={src}
        alt={piece}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
        draggable={false}
      />
    </div>
  );
});

