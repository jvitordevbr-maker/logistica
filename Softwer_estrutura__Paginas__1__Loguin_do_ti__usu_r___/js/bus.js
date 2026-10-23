// Ponte simples para evitar dependência circular entre app.js e as páginas.
export const bus = {
  go: () => {},      // navega para uma tela
  reload: () => {},  // recarrega dados + re-renderiza a tela atual
  render: () => {}   // re-renderiza a tela atual
};
