const page = (title: string, message: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p><p>Volte ao terminal para concluir a configuração.</p></main></body></html>`,
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'Content-Type': 'text/html; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );

export function GET(request: Request): Response {
  const url = new URL(request.url);
  if (url.searchParams.has('error'))
    return page(
      'Autorização não concluída',
      'O Mercado Livre recusou ou cancelou a autorização.',
      400,
    );
  if (!url.searchParams.get('code') || !url.searchParams.get('state'))
    return page('Callback inválido', 'O retorno não contém os parâmetros OAuth esperados.', 400);
  return page(
    'Autorização recebida',
    'A URL deste retorno pode ser colada no terminal para concluir o setup.',
  );
}
