/**
 * Missão Orbital — Cantinho do Professor
 * Cole este arquivo no MESMO projeto do Apps Script que já atende a consulta do aluno.
 * Não substitui o doGet/doPost existente: apenas encaminhe as ações "prof*".
 *
 * Segurança:
 * - Senha do professor NÃO fica no site. Fica o hash SHA-256 em Propriedades do script.
 * - Cada login emite um token aleatório guardado no CacheService (6 h). Sem token, nada é lido.
 * - Avaliações qualitativas ficam em abas próprias e nunca entram na resposta do login do aluno.
 */
var PROF_CACHE_SEG = 6 * 60 * 60;
var PROF_PESOS_PADRAO = {
  atividades: 25, participacao: 20, comportamento: 15,
  respeito: 15, responsabilidade: 15, frequencia: 10
};
var PROF_PESO_NOTA_PADRAO = { academica: 80, qualitativa: 20 };

function profEncaminhar(dados) {
  var action = String(dados && dados.action || '');
  if (action.indexOf('prof') !== 0) return null;
  try {
    if (action === 'profLogin') return profLogin_(dados);
    var sess = profExigirSessao_(dados);
    if (!sess.ok) return sess;
    if (action === 'profSessao') return { ok: true, professor: sess.professor, anoLetivo: profAno_() };
    if (action === 'profTurma') return profTurma_(dados);
    if (action === 'profSalvar') return profSalvar_(dados, sess);
    if (action === 'profFrequencia') return profFrequencia_(dados, sess);
    if (action === 'profConfig') return dados.salvar ? profSalvarConfig_(dados) : profLerConfig_();
    return { ok: false, error: 'Ação do professor desconhecida.' };
  } catch (err) {
    return { ok: false, error: 'Falha ao processar a área do professor.' };
  }
}

/** Rode UMA vez no editor, depois apague a senha deste arquivo. */
function configurarSenhaProfessor() {
  var senha = 'TROQUE-ESTA-SENHA';
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PROF_SENHA_HASH', profSha256_(senha));
  props.setProperty('PROF_NOME', 'Professor Silas');
  props.setProperty('PROF_EMAIL', '');
}

function profLogin_(dados) {
  var esperado = PropertiesService.getScriptProperties().getProperty('PROF_SENHA_HASH');
  if (!esperado) return { ok: false, error: 'Área do professor ainda não configurada no servidor.' };
  var chave = 'prof-falha';
  var cache = CacheService.getScriptCache();
  var falhas = Number(cache.get(chave) || 0);
  if (falhas >= 8) return { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' };
  var senha = String(dados.senha || '');
  var email = String(dados.email || '').trim().toLowerCase();
  var emailOk = PropertiesService.getScriptProperties().getProperty('PROF_EMAIL') || '';
  if (emailOk && email !== emailOk.toLowerCase()) {
    cache.put(chave, String(falhas + 1), 600);
    return { ok: false, error: 'Acesso negado.' };
  }
  if (!senha || profSha256_(senha) !== esperado) {
    cache.put(chave, String(falhas + 1), 600);
    return { ok: false, error: 'Acesso negado.' };
  }
  cache.remove(chave);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var professor = PropertiesService.getScriptProperties().getProperty('PROF_NOME') || 'Professor';
  cache.put('prof:' + token, JSON.stringify({ professor: professor, em: Date.now() }), PROF_CACHE_SEG);
  return { ok: true, token: token, professor: professor, expiraEm: PROF_CACHE_SEG, anoLetivo: profAno_() };
}

function profExigirSessao_(dados) {
  var token = String(dados.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, error: 'Sessão inválida. Entre novamente.' };
  var cru = CacheService.getScriptCache().get('prof:' + token);
  if (!cru) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  var sess = JSON.parse(cru);
  CacheService.getScriptCache().put('prof:' + token, cru, PROF_CACHE_SEG);
  return { ok: true, professor: sess.professor || 'Professor' };
}

function profTurma_(dados) {
  var turma = String(dados.turma || '');
  var bimestre = Number(dados.bimestre || profBimestreAtual_());
  var alunos = profLerAlunos_().filter(function (a) { return !turma || a.turma === turma; });
  var avals = profLerAvaliacoes_().filter(function (a) { return Number(a.bimestre) === bimestre; });
  var freqs = profResumoFrequencia_(turma);
  var config = profLerConfig_().config;
  var lista = alunos.map(function (al) {
    var av = profAchar_(avals, al);
    var fr = freqs[profChave_(al)] || { previstas: 0, faltas: 0, presencas: 0, justificadas: 0, percentual: null };
    var qual = av ? profNotaQualitativa_(av, fr.percentual, config.pesos) : null;
    var acad = al.medias[bimestre - 1];
    var finalNota = (acad != null && qual != null) ? profNotaFinal_(acad, qual, config.pesoNota) : null;
    return {
      turma: al.turma, numero: al.numero, nome: al.nome,
      medias: al.medias, media: acad, frequenciaPlanilha: al.frequencia, situacaoPlanilha: al.situacao,
      avaliacao: av || null,
      frequencia: fr,
      qualitativa: qual,
      notaFinal: finalNota,
      classificacao: qual == null ? '' : profClassificar_(qual),
      situacao: finalNota == null ? '' : profSituacao_(finalNota)
    };
  });
  return {
    ok: true,
    turma: turma,
    bimestre: bimestre,
    anoLetivo: profAno_(),
    turmas: profTurmasUnicas_(profLerAlunos_()),
    config: config,
    alunos: lista,
    historico: profLerAvaliacoes_().filter(function (a) { return !turma || a.turma === turma; })
  };
}

function profSalvar_(dados, sess) {
  var item = dados.avaliacao || {};
  if (!item.turma || !item.nome || !item.bimestre) return { ok: false, error: 'Ficha incompleta.' };
  var sh = profAba_('AvaliacoesQualitativas', ['id', 'aluno', 'turma', 'numero', 'professor', 'bimestre', 'data', 'atualizadoEm', 'atividades', 'participacao', 'comportamento', 'respeito', 'responsabilidade', 'aulasPrevistas', 'faltas', 'presencas', 'observacao', 'qualitativa']);
  var id = String(item.id || (item.turma + '|' + item.numero + '|' + item.bimestre));
  var valores = sh.getDataRange().getValues();
  var linha = -1;
  for (var i = 1; i < valores.length; i++) if (String(valores[i][0]) === id) linha = i + 1;
  var freq = profFreqItem_(item);
  var qual = profNotaQualitativa_(item, freq.percentual, profLerConfig_().config.pesos);
  var agora = new Date().toISOString();
  var row = [id, item.nome, item.turma, item.numero, sess.professor, item.bimestre, item.data || agora.slice(0, 10), agora, item.atividades, item.participacao, item.comportamento, item.respeito, item.responsabilidade, item.aulasPrevistas || '', item.faltas || '', item.presencas || '', item.observacao || '', qual];
  if (linha < 0) sh.appendRow(row); else sh.getRange(linha, 1, 1, row.length).setValues([row]);
  return { ok: true, id: id, qualitativa: qual, atualizadoEm: agora };
}

function profFrequencia_(dados, sess) {
  var sh = profAba_('FrequenciaDiaria', ['id', 'data', 'turma', 'numero', 'aluno', 'marca', 'professor', 'atualizadoEm']);
  var data = String(dados.data || '');
  var turma = String(dados.turma || '');
  if (!data || !turma || !Array.isArray(dados.chamada)) return { ok: false, error: 'Chamada incompleta.' };
  var valores = sh.getDataRange().getValues();
  var mapa = {};
  for (var i = 1; i < valores.length; i++) mapa[String(valores[i][0])] = i + 1;
  var agora = new Date().toISOString();
  dados.chamada.forEach(function (c) {
    var id = data + '|' + turma + '|' + c.numero;
    var row = [id, data, turma, c.numero, c.nome, c.marca, sess.professor, agora];
    if (mapa[id]) sh.getRange(mapa[id], 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
  });
  return { ok: true, atualizadoEm: agora };
}

function profSalvarConfig_(dados) {
  var pesos = dados.pesos || {};
  var pesoNota = dados.pesoNota || {};
  var soma = ['atividades', 'participacao', 'comportamento', 'respeito', 'responsabilidade', 'frequencia'].reduce(function (s, k) { return s + Number(pesos[k] || 0); }, 0);
  if (Math.round(soma) !== 100) return { ok: false, error: 'Os pesos dos critérios precisam somar 100%.' };
  if (Math.round(Number(pesoNota.academica) + Number(pesoNota.qualitativa)) !== 100) return { ok: false, error: 'Peso acadêmico + qualitativo precisa ser 100%.' };
  var sh = profAba_('ConfigMissao', ['chave', 'valor']);
  sh.clear();
  sh.appendRow(['chave', 'valor']);
  sh.appendRow(['pesos', JSON.stringify(pesos)]);
  sh.appendRow(['pesoNota', JSON.stringify(pesoNota)]);
  return profLerConfig_();
}

function profLerConfig_() {
  var pesos = JSON.parse(JSON.stringify(PROF_PESOS_PADRAO));
  var pesoNota = JSON.parse(JSON.stringify(PROF_PESO_NOTA_PADRAO));
  var sh = profPlanilha_().getSheetByName('ConfigMissao');
  if (sh) {
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      if (r[0] === 'pesos') pesos = JSON.parse(r[1]);
      if (r[0] === 'pesoNota') pesoNota = JSON.parse(r[1]);
    });
  }
  return { ok: true, config: { pesos: pesos, pesoNota: pesoNota } };
}

function profLerAlunos_() {
  var sh = profAbaAlunos_();
  var valores = sh.getDataRange().getValues();
  if (valores.length < 2) return [];
  var head = valores[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  function col(nomes) {
    for (var i = 0; i < nomes.length; i++) {
      var p = head.indexOf(nomes[i]);
      if (p >= 0) return p;
    }
    return -1;
  }
  var cTurma = col(['turma', 'classe']);
  var cNum = col(['numero', 'número', 'n', 'chamada', 'nº']);
  var cNome = col(['nome', 'aluno', 'estudante']);
  var cFreq = col(['frequencia', 'frequência']);
  var cSit = col(['situacao', 'situação']);
  var cB = [1, 2, 3, 4].map(function (n) { return col(['b' + n, 'bimestre ' + n, n + 'º bimestre', 'media ' + n, 'média ' + n]); });
  return valores.slice(1).filter(function (r) { return cNome < 0 ? false : String(r[cNome] || '').trim(); }).map(function (r) {
    return {
      turma: cTurma < 0 ? '' : String(r[cTurma] || ''),
      numero: cNum < 0 ? '' : String(r[cNum] || ''),
      nome: String(r[cNome] || ''),
      frequencia: cFreq < 0 ? '' : String(r[cFreq] || ''),
      situacao: cSit < 0 ? '' : String(r[cSit] || ''),
      medias: cB.map(function (c) { return c < 0 || r[c] === '' ? null : Number(String(r[c]).replace(',', '.')); })
    };
  });
}

function profLerAvaliacoes_() {
  var sh = profPlanilha_().getSheetByName('AvaliacoesQualitativas');
  if (!sh) return [];
  var valores = sh.getDataRange().getValues();
  return valores.slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    return {
      id: String(r[0]), nome: r[1], turma: r[2], numero: String(r[3]), professor: r[4], bimestre: Number(r[5]),
      data: r[6], atualizadoEm: r[7], atividades: numOuNull_(r[8]), participacao: numOuNull_(r[9]),
      comportamento: numOuNull_(r[10]), respeito: numOuNull_(r[11]), responsabilidade: numOuNull_(r[12]),
      aulasPrevistas: numOuNull_(r[13]), faltas: numOuNull_(r[14]), presencas: numOuNull_(r[15]),
      observacao: r[16] || '', qualitativa: numOuNull_(r[17])
    };
  });
}

function profResumoFrequencia_(turma) {
  var sh = profPlanilha_().getSheetByName('FrequenciaDiaria');
  var mapa = {};
  if (!sh) return mapa;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (turma && String(r[2]) !== turma) return;
    var k = String(r[2]) + '|' + String(r[3]);
    if (!mapa[k]) mapa[k] = { previstas: 0, presencas: 0, faltas: 0, justificadas: 0, percentual: null };
    mapa[k].previstas++;
    if (r[5] === 'P') mapa[k].presencas++;
    else if (r[5] === 'J') mapa[k].justificadas++;
    else mapa[k].faltas++;
  });
  Object.keys(mapa).forEach(function (k) {
    var f = mapa[k];
    f.percentual = f.previstas ? Math.round((f.presencas / f.previstas) * 1000) / 10 : null;
  });
  return mapa;
}

function profNotaQualitativa_(av, freqPct, pesos) {
  pesos = pesos || PROF_PESOS_PADRAO;
  var freqNota = freqPct == null ? null : Math.max(0, Math.min(10, Number(freqPct) / 10));
  var partes = [
    ['atividades', av.atividades], ['participacao', av.participacao], ['comportamento', av.comportamento],
    ['respeito', av.respeito], ['responsabilidade', av.responsabilidade], ['frequencia', freqNota]
  ];
  var somaP = 0, soma = 0;
  partes.forEach(function (p) {
    if (p[1] == null || p[1] === '') return;
    var w = Number(pesos[p[0]] || 0);
    soma += Number(p[1]) * w;
    somaP += w;
  });
  if (!somaP) return null;
  return Math.round((soma / somaP) * 10) / 10;
}

function profNotaFinal_(acad, qual, pesoNota) {
  pesoNota = pesoNota || PROF_PESO_NOTA_PADRAO;
  return Math.round((Number(acad) * Number(pesoNota.academica) + Number(qual) * Number(pesoNota.qualitativa))) / 100;
}

function profClassificar_(n) {
  if (n >= 9) return 'Excelente';
  if (n >= 7) return 'Bom';
  if (n >= 5) return 'Em desenvolvimento';
  return 'Necessita de acompanhamento';
}
function profSituacao_(n) {
  if (n >= 7) return 'Bom desempenho';
  if (n >= 5) return 'Atenção';
  return 'Necessita acompanhamento';
}
function profAba_(nome, cab) {
  var sh = profPlanilha_().getSheetByName(nome);
  if (!sh) {
    sh = profPlanilha_().insertSheet(nome);
    sh.appendRow(cab);
    sh.getRange(1, 1, 1, cab.length).setFontWeight('bold');
  }
  return sh;
}
function profAbaAlunos_() {
  var ss = profPlanilha_();
  return ss.getSheetByName('Alunos') || ss.getSheetByName('Notas') || ss.getSheets()[0];
}
function profPlanilha_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function profAno_() { return 2026; }
function profBimestreAtual_() { return 3; }
function profTurmasUnicas_(alunos) {
  var m = {};
  alunos.forEach(function (a) { if (a.turma) m[a.turma] = 1; });
  return Object.keys(m).sort();
}
function profChave_(al) { return al.turma + '|' + al.numero; }
function profAchar_(avals, al) {
  for (var i = 0; i < avals.length; i++) if (String(avals[i].turma) === String(al.turma) && String(avals[i].numero) === String(al.numero)) return avals[i];
  return null;
}
function profFreqItem_(item) {
  var prev = Number(item.aulasPrevistas || 0), pres = Number(item.presencas || 0);
  return { percentual: prev ? Math.round((pres / prev) * 1000) / 10 : null };
}
function numOuNull_(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
function profSha256_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b + 256) % 256; return ('0' + v.toString(16)).slice(-2); }).join('');
}

/**
 * Use no login do aluno, antes de devolver o JSON:
 *   estudante = sanitizarRespostaAluno_(estudante);
 * Assim uma observação qualitativa nunca volta na consulta do estudante.
 */
function sanitizarRespostaAluno_(estudante) {
  if (!estudante || typeof estudante !== 'object') return estudante;
  ['qualitativa', 'notaQualitativa', 'observacao', 'observacaoProfessor', 'avaliacao', 'criterios', 'comportamento', 'participacao'].forEach(function (k) { delete estudante[k]; });
  return estudante;
}
