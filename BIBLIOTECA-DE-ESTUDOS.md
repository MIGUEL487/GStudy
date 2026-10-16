# Vídeos, trechos e livros no GStudy

A biblioteca de **Rumo à prova → Vídeos & livros** passa a ter player oficial do YouTube, identidade do canal, materiais gratuitos autorizados e livros na Amazon Brasil. A curadoria acontece quando a biblioteca é aberta pela primeira vez; o resultado fica salvo na conta e pode ser atualizado pelo botão **Atualizar indicações**. Trocar de aba, reabrir ou recarregar não dispara outra pesquisa para uma biblioteca já salva. Falha de gravação permite salvar novamente o resultado pronto sem outra pesquisa.

## Habilitar a busca oficial do YouTube na Vercel

1. No Google Cloud, escolha um projeto e habilite [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
2. Em [APIs e serviços → Credenciais](https://console.cloud.google.com/apis/credentials), crie uma chave de API. Restrinja a API permitida a **YouTube Data API v3**. Ela é usada pelo servidor; restrição de referenciador de navegador não serve para essas chamadas da Vercel.
3. Adicione **`YOUTUBE_API_KEY`** nas Environment Variables do projeto GStudy, em **Production**, e faça **Redeploy**. Use Preview se também quiser testar ali. Não use prefixo `VITE_`, não publique a chave no Git e não envie seu valor no chat.

A chave da IA não habilita automaticamente a API do YouTube. Essa integração tem configuração própria, sem trocar `BOARD_AI_API_KEY`, `GROQ_API_KEY` ou `OPENROUTER_API_KEY`. A busca consome a cota do projeto Google; consulte as cotas no painel. Sem chave YouTube, o aplicativo ainda pode incorporar uma fonte real encontrada pela busca da IA e confirmada por oEmbed, mas não inventa logo, duração ou capítulos ausentes. Se nenhuma aula real for confirmada, mantém buscas identificadas e permite tentar atualizar.

A implementação usa as APIs oficiais `search`, `videos`, `channels` e oEmbed; não baixa vídeos nem transcrições. Faz até três buscas por atualização, obtém metadados em lote e não pesquisa novamente toda vez que uma pessoa dá play. Detalhes de cota e disponibilidade dependem do projeto. Não houve chamada real com chave YouTube neste ambiente de desenvolvimento, pois essa credencial não estava disponível.

## Curadoria, canal e trechos

A IA compara assunto, etapa escolar, objetivo e metadados públicos das aulas. Prioriza **Universo Narrado**, **Universo Narrado Militares** em concursos militares, e **Pedro Asaad** em conteúdos pertinentes. A preferência não autoriza indicar um vídeo que não corresponde ao assunto. É uma seleção pedagógica, não um ranking objetivo de todo o YouTube.

Título, nome do canal e foto vêm dos metadados do YouTube. O avatar tem formato circular; o nome usa a tipografia do site. Se uma foto não puder ser obtida, o site usa um ícone neutro, sem inventar um logo. O player oficial tem bordas arredondadas e preserva controles e atribuição; não há rehost, remoção de marcas ou tentativa de contornar bloqueio de incorporação.

Em uma aula longa, a IA escolhe os índices de capítulos publicados pelo próprio canal. O servidor converte esses índices em limites reais de início/fim e envia `start` e `end` ao player. Horários fora dos capítulos são descartados. Sem capítulos suficientes e coerentes, a aula abre inteira. A pessoa pode escolher outro capítulo ou voltar à aula completa. O aplicativo não afirma que assistiu a um vídeo apenas por analisar seus metadados.

Referência oficial do player: [parâmetros do YouTube](https://developers.google.com/youtube/player_parameters). O comportamento de reprodução e eventuais bloqueios continuam sob controle do YouTube e do proprietário do vídeo.

## Biblioteca gratuita e direitos

A IA procura referências oficiais de órgãos públicos e instituições de ensino brasileiros. Um arquivo gratuito ou hospedado em `.gov.br`/`.edu.br` **não recebe autorização comercial automaticamente**.

Um PDF só entra como leitura disponível quando a fonte oficial declara a licença do próprio material em metadados de obra: Dublin Core/citação ou JSON-LD de Book/LearningResource/CreativeWork. O título precisa corresponder ao livro e os créditos precisam estar informados pela fonte, sem depender de autoria inventada pela IA; o arquivo precisa ser um PDF único vinculado à mesma origem oficial. A fonte e o cabeçalho do arquivo são verificados no servidor.

São aceitas declarações explícitas **CC BY**, **CC BY-SA**, **CC BY-ND**, **CC0** e marcação de **domínio público**. Licenças com **NC/NãoComercial**, direitos reservados, arquivos ambíguos, documentos sem licença da obra e permissões genéricas no rodapé não liberam o PDF. Uma licença de Website não equivale à de um livro. Essa verificação é uma regra conservadora de publicação, não uma garantia jurídica universal sobre qualquer obra na internet.

O leitor abre o documento original na origem, sem hospedá-lo ou modificá-lo. A tela mantém título, autoria, link da licença e evidência dos direitos. Se o servidor oficial bloquear iframe, o site oferece a fonte externa apenas para o arquivo autorizado. Um catálogo confirmado como HTML pode ser listado para pesquisa sem disponibilizar seu PDF; uma URL que devolva um PDF sem autorização não é publicada como se fosse catálogo. Pastas pessoais do Google Drive não são consultadas nem divulgadas nesta curadoria.

A busca pode não encontrar um PDF com direitos confirmados. Nesse caso, a seção explica a ausência; o aplicativo não libera automaticamente um arquivo para preencher a biblioteca.

## Livros na Amazon

As recomendações comerciais ficam em uma seção separada. Quando há uma página de produto correspondente nas fontes pesquisadas, o site normaliza para `https://www.amazon.com.br/dp/<ASIN>`, sem afiliado. Sem produto confirmado, constrói uma busca com título/autor na Amazon Brasil e a identifica como busca. A IA não inventa ASIN, ISBN, preço, disponibilidade ou gratuidade, e PDFs de livros pagos não são fornecidos.

## Dados, privacidade e testes

A curadoria recebe apenas tópicos e contexto público do desafio; nomes de provas particulares, cadernos, respostas, arquivos e PDFs privados não entram nas consultas. As chaves ficam no servidor. O novo campo `preparation.guide.library` é opcional para preservar planos antigos e usa a sincronização por conta existente, sem migração SQL. Salvar a biblioteca não substitui sessões, anotações nem o restante do plano.

Testes com HTTP simulado verificam API e credenciais separadas, player, capítulos, bloqueios de iframe, licença da obra, recusa de NC e rodapés genéricos, Amazon, fontes privadas, cache e salvamento. A reprodução real e as cotas dependem da configuração do serviço externo na hospedagem.

Validação desta atualização: 284 testes passaram, além da checagem TypeScript e do build Vercel. A interface foi exercitada em 1512 px e 390 px com autenticação, metadados, player e respostas de IA simulados: trecho por capítulo, aula completa, logo/nome do canal, PDF autorizado, Amazon, persistência e ausência de pesquisa repetida ao recarregar. Não houve erros de JavaScript nem rolagem horizontal.

## Recuperação após configurar a chave

Um resultado sem vídeos pode ter sido salvo antes de `YOUTUBE_API_KEY` existir no deployment. Ao reabrir uma biblioteca indisponível, o aplicativo verifica apenas a presença da configuração, sem expor a chave. Se a integração agora estiver configurada, refaz a curadoria uma vez; sem chave, informa a configuração ausente sem gastar outra pesquisa de IA. Bibliotecas com vídeos confirmados continuam usando o resultado salvo. O botão Atualizar indicações permanece disponível.

Erros novos distinguem API não habilitada no projeto Google, restrições da chave, configuração recusada, cota, conexão e busca sem resultados. Os logs registram só categoria e status HTTP, sem URL da chamada, chave ou mensagem bruta do Google.
