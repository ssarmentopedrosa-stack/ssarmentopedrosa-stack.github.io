# Cantinho do Professor — Missão Orbital

A consulta do aluno permanece no mesmo `index.html` e na mesma API. A área do professor é um botão discreto e só mostra dados depois de um token emitido pelo Apps Script.

Não há Firebase neste projeto. A autenticação reutiliza o Apps Script que já serve as notas.

## Como publicar

1. Envie `index.html` e `professor.js` para o GitHub Pages, na mesma pasta do site atual (`/notas/`).
2. No projeto do Apps Script que já responde à consulta, cole `apps-script/Professor.gs`.
3. No `doGet` e no `doPost` existentes, acrescente o encaminhamento descrito em `apps-script/PATCH-doGet-doPost.txt`. Não apague o `action=turmas` nem o `action=login`.
4. No editor do Apps Script, rode uma vez `configurarSenhaProfessor()` depois de trocar a senha dentro da função. Em seguida apague a senha do arquivo. O site guarda só o hash em Propriedades do script (`PROF_SENHA_HASH`).
5. Opcional: defina `PROF_EMAIL` com o e-mail do professor. Se estiver preenchido, o login também exige esse e-mail.
6. A planilha ligada ao script precisa de uma aba `Alunos` ou `Notas` com colunas reconhecíveis: Turma, Número, Nome, B1–B4, Frequência, Situação. As abas `AvaliacoesQualitativas`, `FrequenciaDiaria` e `ConfigMissao` são criadas na primeira gravação.
7. Implante de novo o web app (nova versão). A URL `/exec` pode continuar a mesma.

Prévia só da interface, com alunos fictícios: abra `index.html?preview=professor`. Senha de demonstração: `orbita-preview`. Isso não vale como segurança e não lê a planilha real.

## Fórmula

Nota de frequência = percentual / 10, limitada de 0 a 10. Ex.: 90% vira 9,0. Presença justificada (J) é registrada, mas não conta como presença.

Nota qualitativa, pesos padrão (editáveis, soma 100%):

- Atividades 25%
- Participação 20%
- Comportamento 15%
- Respeito e convivência 15%
- Responsabilidade 15%
- Frequência 10%

Critério ainda não marcado sai da média e o peso restante é renormalizado, para um lançamento parcial não virar zero.

Nota final = acadêmica × peso acadêmico + qualitativa × peso qualitativo. Padrão 80% / 20%. A média da planilha não é substituída.

Classificação da qualitativa: 9,0–10 Excelente; 7,0–8,9 Bom; 5,0–6,9 Em desenvolvimento; abaixo de 5 Necessita de acompanhamento.

Situação da turma, pela nota final: ≥ 7 Bom desempenho; 5–6,9 Atenção; abaixo de 5 Necessita acompanhamento.

Exemplo: 7,5 × 80% + 8,7 × 20% = 7,74.

## Segurança

- Senha do professor não está no JavaScript.
- Token aleatório de 64 hex, no CacheService, expira em 6 horas e é renovado a cada uso.
- Oito falhas de senha bloqueiam por 10 minutos.
- Ações `prof*` sem token devolvem acesso negado.
- Observações e critérios ficam em abas próprias. `sanitizarRespostaAluno_` deve ser chamada no login do aluno para impedir vazamento se alguém juntar os objetos.
- O site público não traz lista de alunos nem observações.
- A prévia local é explícita e usa nomes fictícios.

Limite desta entrega: o Apps Script de produção não foi alterado daqui, porque a conta Google do projeto não está acessível. Até o patch ser publicado, o botão do professor responde que a área ainda não foi implantada. A consulta do aluno não depende desse patch.
