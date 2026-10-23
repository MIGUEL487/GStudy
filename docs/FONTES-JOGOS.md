# Fontes dos jogos

O mapa usa limites de países do **Natural Earth**, conjunto cartográfico de domínio público, sem imagens de serviços comerciais. A projeção equiretangular e a transformação para caminhos SVG foram feitas neste projeto; a Antártida fica fora da área jogável.

- Fonte: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
- Licença e condições: https://www.naturalearthdata.com/about/terms-of-use/
- Arquivo obtido em 23/10/2026; SHA-256: `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`.
- Reprodução: baixe o GeoJSON pela fonte acima, execute `node scripts/build-world-map.mjs /caminho/arquivo.geojson` e formate o JSON com Prettier. O script verifica a integridade e exige revisão se a fonte mudar.

Países, capitais, unidades, estados brasileiros e datas são dados factuais; listas e enunciados locais foram escritos para o GStudy. As bandeiras usam os caracteres padronizados Unicode. Não há iframe, Street View, Google Maps, scraping nem código ou arte dos sites citados como inspiração.

As contas e equações são geradas por regras determinísticas, com a semente compartilhada. As questões geradas por IA passam por validação de estrutura, alternativas, respostas e mecânica; informações geradas continuam sujeitas a revisão pedagógica. O cache compartilhado recebe somente conteúdo escrito pelo servidor, sem notas pessoais, arquivos ou histórico da conta.
