import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Executa uma função assíncrona e controla data/loading/error.
 * Cada execução recebe um número; respostas de execuções antigas (atrasadas) são ignoradas.
 */
export function useAsync(asyncFn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const counter = useRef(0);
  const fnRef = useRef(asyncFn);
  fnRef.current = asyncFn;

  const run = useCallback(async () => {
    const id = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === counter.current) setState({ data, loading: false, error: null });
    } catch (err) {
      if (id === counter.current) setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    run();
    return () => { counter.current++; }; // invalida respostas pendentes ao desmontar/re-executar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}
