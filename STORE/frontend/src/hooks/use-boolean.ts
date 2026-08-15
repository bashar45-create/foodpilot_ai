import { useState } from 'react';

export function useBoolean(initial = false): [boolean, { on: () => void; off: () => void; toggle: () => void }] {
  const [value, setValue] = useState(initial);
  return [
    value,
    {
      on: () => setValue(true),
      off: () => setValue(false),
      toggle: () => setValue((current) => !current),
    },
  ];
}
