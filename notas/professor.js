/* Cantinho do Professor — não contém notas nem observações.
   Tudo que é dado sensível só chega depois de um token emitido pelo Apps Script. */
(function () {
  var EXEC = 'https://script.google.com/macros/s/AKfycbx5GTuYza-PuWZHkHlq4zuyVbrl55o-h5l_9AW6IDVonirRjBw5fiPTiLuObwK2BKE/exec';
  var PREVIEW = /[?&]preview=professor\b/.test(location.search);
  var PESOS_PADRAO = { atividades: 25, participacao: 20, comportamento: 15, respeito: 15, responsabilidade: 15, frequencia: 10 };
  var PESO_NOTA_PADRAO = { academica: 80, qualitativa: 20 };
  var CRITERIOS = [
    { id: 'atividades', nome: 'Atividades', opcoes: [['Não realizou', 0], ['Parcialmente', 5], ['Realizou', 8], ['Excelente empenho', 10]] },
    { id: 'participacao', nome: 'Participação', opcoes: [['Muito baixa', 2], ['Baixa', 5], ['Adequada', 8], ['Excelente', 10]] },
    { id: 'comportamento', nome: 'Comportamento', opcoes: [['Problemático', 2], ['Precisa melhorar', 5], ['Adequado', 8], ['Excelente', 10]] },
    { id: 'respeito', nome: 'Respeito e convivência', opcoes: [['Precisa melhorar', 4], ['Adequado', 7], ['Muito bom', 9], ['Excelente', 10]] },
    { id: 'responsabilidade', nome: 'Responsabilidade', opcoes: [['Muito baixa', 2], ['Baixa', 5], ['Adequada', 8], ['Excelente', 10]] }
  ];
  var estado = { token: '', professor: '', config: { pesos: Object.assign({}, PESOS_PADRAO), pesoNota: Object.assign({}, PESO_NOTA_PADRAO) }, pacote: null, aluno: null, vista: 'turma' };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&#38;', '<': '&#60;', '>': '&#62;', '"': '&#34;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; }
  function br(n) { return n == null || isNaN(n) ? '—' : Number(n).toFixed(1).replace('.', ','); }
  function notaFrequencia(pct) { return pct == null ? null : Math.max(0, Math.min(10, Number(pct) / 10)); }
  function limitarNota(n) {
    if (n == null || isNaN(n)) return null;
    return Math.max(0, Math.min(10, n));
  }
  function notaQualitativa(av, freqPct, pesos) {
    pesos = pesos || PESOS_PADRAO;
    var partes = CRITERIOS.map(function (c) { return [c.id, av[c.id]]; }).concat([['frequencia', notaFrequencia(freqPct)]]);
    var soma = 0, somaP = 0;
    partes.forEach(function (p) {
      if (p[1] == null || p[1] === '') return;
      var w = Number(pesos[p[0]] || 0);
      soma += limitarNota(Number(p[1])) * w;
      somaP += w;
    });
    if (!somaP) return null;
    return limitarNota(Math.round((soma / somaP) * 10) / 10);
  }
  function notaFinal(acad, qual, peso) {
    peso = peso || PESO_NOTA_PADRAO;
    if (acad == null || qual == null) return null;
    var valor = Math.round((Number(acad) * Number(peso.academica) + Number(qual) * Number(peso.qualitativa))) / 100;
    return limitarNota(valor);
  }
  function classificar(n) {
    if (n == null) return '';
    if (n >= 9) return 'Excelente';
    if (n >= 7) return 'Bom';
    if (n >= 5) return 'Em desenvolvimento';
    return 'Necessita de acompanhamento';
  }
  function situacao(n) {
    if (n == null) return '';
    if (n >= 7) return 'Bom desempenho';
    if (n >= 5) return 'Atenção';
    return 'Necessita acompanhamento';
  }
  function percentualFrequencia(presencas, previstas) {
    if (previstas == null || previstas <= 0 || presencas == null) return null;
    return Math.max(0, Math.min(100, Math.round((Number(presencas) / Number(previstas)) * 1000) / 10));
  }
  function seloFreq(pct) {
    if (pct == null) return '';
    if (pct >= 90) return 'freq-ok';
    if (pct >= 75) return 'freq-mid';
    return 'freq-bad';
  }
  function rotuloFreq(pct) {
    if (pct == null) return '';
    if (pct >= 90) return 'excelente';
    if (pct >= 75) return 'atenção';
    return 'precisa de atenção';
  }
  function tendencia(pontos) {
    var vals = pontos.filter(function (p) { return p != null; });
    if (vals.length < 2) return 'sem dados suficientes';
    var d = vals[vals.length - 1] - vals[0];
    if (d >= 0.4) return '↑ Melhorando';
    if (d <= -0.4) return '↓ Em queda';
    return '→ Estável';
  }

  function api(post) {
    if (PREVIEW) return previewApi(post);
    return fetch(EXEC, {
      method: 'POST', credentials: 'omit', redirect: 'follow', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(post)
    }).then(function (r) { return r.text(); }).then(function (t) {
      try { return JSON.parse(t); } catch (e) { throw new Error('resposta inválida'); }
    });
  }

  function abrir() {
    $('telaLogin').hidden = true;
    $('telaResultado').hidden = true;
    $('telaProfessor').hidden = false;
    if (estado.token) mostrarApp(); else mostrarLogin();
    window.scrollTo(0, 0);
  }
  function fechar() {
    $('telaProfessor').hidden = true;
    $('telaLogin').hidden = false;
    window.scrollTo(0, 0);
  }
  function sairProf() {
    estado.token = ''; estado.pacote = null; estado.aluno = null;
    sessionStorage.removeItem('mo_prof_token');
    sessionStorage.removeItem('mo_prof_nome');
    mostrarLogin();
  }
  function mostrarLogin() {
    $('profCorpo').innerHTML = '<form class="prof-login vidro" id="formProf">' +
      (PREVIEW ? '<p class="prof-aviso">Prévia local, sem dados reais. Senha de demonstração: <b>orbita-preview</b>. Isto não é a segurança de produção.</p>' : '') +
      '<p class="rot-mini">Acesso restrito</p><h2>Cantinho do Professor</h2>' +
      '<p class="prof-lead">Missão Orbital – Acompanhamento do Desempenho. A senha é conferida no servidor; o site não guarda a senha nem a lista de alunos.</p>' +
      '<label>E-mail do professor<input id="profEmail" type="email" autocomplete="username" placeholder="opcional, se estiver cadastrado"></label>' +
      '<label>Senha do professor<input id="profSenha" type="password" autocomplete="current-password" required></label>' +
      '<p class="erro" id="profErro"></p><button class="btn" type="submit">Entrar na área</button>' +
      '<button class="btn secundario" type="button" id="profVoltarLogin">Voltar à consulta do aluno</button></form>';
    $('formProf').onsubmit = function (ev) {
      ev.preventDefault();
      var btn = ev.target.querySelector('.btn');
      btn.disabled = true;
      api({ action: 'professorLogin', email: $('profEmail').value.trim(), senha: $('profSenha').value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok || !res.token) { $('profErro').textContent = res.error || 'Acesso negado.'; $('profErro').classList.add('visivel'); return; }
        estado.token = res.token; estado.professor = res.professor || 'Professor';
        sessionStorage.setItem('mo_prof_token', res.token);
        sessionStorage.setItem('mo_prof_nome', estado.professor);
        carregar();
      }).catch(function () {
        btn.disabled = false;
        $('profErro').textContent = 'Não foi possível entrar. Publique o Apps Script do professor ou use ?preview=professor para ver a interface.';
        $('profErro').classList.add('visivel');
      });
    };
    $('profVoltarLogin').onclick = fechar;
  }
  function mostrarApp() {
    $('profCorpo').innerHTML = (PREVIEW ? '<p class="prof-aviso">MODO DE PRÉVIA. Alunos fictícios: Ana, Bruno e Carla Preview. A senha orbita-preview não autentica produção e não grava na escola.</p>' : '') +
      '<div class="prof-topo"><div><p class="rot-mini">Cantinho do Professor</p><h2>Missão Orbital – Acompanhamento do Desempenho</h2>' +
      '<p class="prof-meta" id="profMeta"></p></div><button class="btn secundario prof-sair" type="button" id="profSair">Sair</button></div>' +
      '<p class="prof-ok" id="profOk" hidden></p>' +
      '<div class="prof-filtros"><label>Turma<select id="profTurma"></select></label><label>Bimestre<select id="profBim">' +
      [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '">' + n + 'º bimestre</option>'; }).join('') +
      '</select></label><label>Buscar aluno<input id="profBusca" placeholder="Nome"></label></div>' +
      '<div class="prof-abas" role="tablist"><button type="button" data-vista="turma">Turma</button><button type="button" data-vista="rapida">Avaliação rápida</button><button type="button" data-vista="freq">Frequência</button><button type="button" data-vista="pesos">Pesos</button><button type="button" data-vista="exportar">Exportar</button></div>' +
      '<div id="profPainel"></div><div id="profFicha" hidden></div>';
    $('profSair').onclick = function () { sairProf(); fechar(); };
    $('profBim').value = '3';
    $('profBusca').oninput = render;
    $('profTurma').onchange = carregar;
    $('profBim').onchange = carregar;
    Array.prototype.forEach.call(document.querySelectorAll('.prof-abas button'), function (b) {
      b.onclick = function () { estado.vista = b.getAttribute('data-vista'); estado.aluno = null; render(); };
    });
    render();
  }
  function carregar() {
    if (!$('profPainel')) mostrarApp();
    $('profPainel').innerHTML = '<p class="prof-lead">Carregando turma…</p>';
    api({ action: 'professorStudents', token: estado.token, turma: $('profTurma') && $('profTurma').value || '', bimestre: $('profBim') && $('profBim').value || 3 }).then(function (res) {
      if (!res.ok) { estado.token = ''; sessionStorage.removeItem('mo_prof_token'); mostrarLogin(); return; }
      estado.pacote = res;
      if (res.config) estado.config = res.config;
      var sel = $('profTurma');
      var atual = sel.value || res.turma || (res.turmas && res.turmas[0]) || '';
      sel.innerHTML = (res.turmas || []).map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
      sel.value = atual;
      render();
    }).catch(function () {
      $('profPainel').innerHTML = '<p class="erro visivel">Falha ao carregar. A sessão pode ter expirado.</p>';
    });
  }
  function alunosFiltrados() {
    var q = ($('profBusca') && $('profBusca').value || '').trim().toLowerCase();
    return ((estado.pacote && estado.pacote.alunos) || []).filter(function (a) { return !q || a.nome.toLowerCase().indexOf(q) >= 0; });
  }
  function render() {
    if (!$('profPainel') || !estado.pacote) return;
    var p = estado.pacote;
    $('profMeta').textContent = estado.professor + ' · Ano letivo ' + (p.anoLetivo || 2026) + ' · ' + ($('profTurma').value || 'turma') + ' · ' + $('profBim').value + 'º bimestre';
    Array.prototype.forEach.call(document.querySelectorAll('.prof-abas button'), function (b) {
      b.classList.toggle('ativa', b.getAttribute('data-vista') === estado.vista);
    });
    $('profFicha').hidden = true;
    if ($('profOk')) {
      $('profOk').hidden = !estado.aviso;
      $('profOk').textContent = estado.aviso || '';
      estado.aviso = '';
    }
    if (estado.vista === 'turma') renderTurma();
    else if (estado.vista === 'rapida') renderRapida();
    else if (estado.vista === 'freq') renderFreq();
    else if (estado.vista === 'pesos') renderPesos();
    else renderExportar();
  }
  function mediaDe(arr) { return arr.length ? arr.reduce(function (s, n) { return s + n; }, 0) / arr.length : null; }
  function cards(alunos) {
    var finais = alunos.map(function (a) { return a.notaFinal; }).filter(function (n) { return n != null; });
    var quals = alunos.map(function (a) { return a.qualitativa; }).filter(function (n) { return n != null; });
    var freq = alunos.map(function (a) { return a.frequencia && a.frequencia.percentual; }).filter(function (n) { return n != null; });
    var crit = function (id) { return alunos.map(function (a) { return a.avaliacao && a.avaliacao[id]; }).filter(function (n) { return n != null && n !== ''; }).map(Number); };
    var bom = alunos.filter(function (a) { return a.notaFinal != null && a.notaFinal >= 7; }).length;
    var at = alunos.filter(function (a) { return a.notaFinal != null && a.notaFinal >= 5 && a.notaFinal < 7; }).length;
    var ru = alunos.filter(function (a) { return a.notaFinal != null && a.notaFinal < 5; }).length;
    var pend = alunos.filter(function (a) { return a.qualitativa == null; }).length;
    return '<div class="prof-cards"><div class="vidro"><b>' + alunos.length + '</b><span>Alunos</span></div>' +
      '<div class="vidro"><b>' + br(mediaDe(finais)) + '</b><span>Média da turma</span></div>' +
      '<div class="vidro"><b>' + br(finais.length ? Math.max.apply(null, finais) : null) + '</b><span>Maior desempenho</span></div>' +
      '<div class="vidro"><b>' + br(finais.length ? Math.min.apply(null, finais) : null) + '</b><span>Menor desempenho</span></div>' +
      '<div class="vidro ok"><b>' + bom + '</b><span>Situação adequada</span></div>' +
      '<div class="vidro mid"><b>' + at + '</b><span>Precisam de atenção</span></div>' +
      '<div class="vidro bad"><b>' + ru + '</b><span>Acompanhamento</span></div>' +
      '<div class="vidro"><b>' + pend + '</b><span>Sem avaliação</span></div>' +
      '<div class="vidro"><b>' + br(mediaDe(freq)) + '%</b><span>Frequência média</span></div>' +
      '<div class="vidro"><b>' + br(mediaDe(crit('atividades'))) + '</b><span>Atividades</span></div>' +
      '<div class="vidro"><b>' + br(mediaDe(crit('participacao'))) + '</b><span>Participação</span></div>' +
      '<div class="vidro"><b>' + br(mediaDe(crit('comportamento'))) + '</b><span>Comportamento</span></div></div>';
  }
  function renderTurma() {
    var alunos = alunosFiltrados();
    var html = cards(alunos) + '<div class="prof-tabela"><table><thead><tr><th>Aluno</th><th>Média</th><th>Qualitativa</th><th>Frequência</th><th>Nota final</th><th>Situação</th><th></th></tr></thead><tbody>';
    alunos.forEach(function (a, i) {
      var pct = a.frequencia && a.frequencia.percentual;
      html += '<tr><td>' + esc(a.nome) + '<small>Nº ' + esc(a.numero) + (a.qualitativa == null ? ' · pendente' : ' · avaliado') + '</small></td><td>' + br(a.media) + '</td><td>' + br(a.qualitativa) + '</td><td class="' + seloFreq(pct) + '">' + (pct == null ? '—' : br(pct) + '% ' + rotuloFreq(pct)) + '</td><td>' + br(a.notaFinal) + '</td><td>' + esc(a.situacao || 'sem avaliação') + '</td><td><button type="button" class="btn mini" data-i="' + i + '">Avaliar</button></td></tr>';
    });
    html += '</tbody></table></div>';
    $('profPainel').innerHTML = html || '<p>Nenhum aluno.</p>';
    Array.prototype.forEach.call($('profPainel').querySelectorAll('[data-i]'), function (b) {
      b.onclick = function () { abrirFicha(alunos[Number(b.getAttribute('data-i'))]); };
    });
  }
  function abrirFicha(aluno) {
    estado.aluno = aluno;
    var av = Object.assign({ atividades: '', participacao: '', comportamento: '', respeito: '', responsabilidade: '', aulasPrevistas: aluno.frequencia && aluno.frequencia.previstas || '', faltas: aluno.frequencia && aluno.frequencia.faltas || '', presencas: aluno.frequencia && aluno.frequencia.presencas || '', observacao: '' }, aluno.avaliacao || {});
    var html = '<div class="vidro prof-ficha"><p class="rot-mini">Ficha individual</p><h3>' + esc(aluno.nome) + '</h3><p>' + esc(aluno.turma) + ' · Nº ' + esc(aluno.numero) + ' · média acadêmica ' + br(aluno.media) + '</p>';
    CRITERIOS.forEach(function (c) {
      html += '<fieldset><legend>' + esc(c.nome) + '</legend><div class="prof-opcoes">';
      c.opcoes.forEach(function (op) {
        html += '<label><input type="radio" name="' + c.id + '" value="' + op[1] + '"' + (String(av[c.id]) === String(op[1]) ? ' checked' : '') + '> ' + esc(op[0]) + ' <b>' + op[1] + '</b></label>';
      });
      html += '</div></fieldset>';
    });
    html += '<div class="prof-freq3"><label>Aulas previstas<input id="fqPrev" type="number" min="0" value="' + esc(av.aulasPrevistas || '') + '"></label><label>Faltas<input id="fqFal" type="number" min="0" value="' + esc(av.faltas || '') + '"></label><label>Presenças<input id="fqPre" type="number" min="0" value="' + esc(av.presencas || '') + '"></label></div>' +
      '<p id="fqPct" class="prof-lead"></p><label>Observação do professor <small>(opcional, não altera a nota)</small><textarea id="fqObs" maxlength="280" placeholder="Opcional. Uma ou duas frases.">' + esc(av.observacao || '') + '</textarea></label>' +
      '<div class="prof-nota" id="fqNota"></div><div class="prof-evol" id="fqEvol"></div>' +
      '<div class="prof-acoes"><button class="btn" type="button" id="fqSalvar">Salvar avaliação</button><button class="btn secundario" type="button" id="fqFechar">Fechar</button></div><p class="erro" id="fqErro"></p></div>';
    $('profFicha').hidden = false;
    $('profFicha').innerHTML = html;
    function atualizar() {
      var prev = num($('fqPrev').value), pres = num($('fqPre').value), fal = num($('fqFal').value);
      var invalida = prev != null && pres != null && (pres > prev || (fal != null && pres + fal > prev));
      var pct = invalida ? null : percentualFrequencia(pres, prev);
      $('fqPct').innerHTML = invalida ? '<b class="freq-bad">Presenças e faltas não podem passar das aulas previstas.</b>' : ('Frequência: <b class="' + seloFreq(pct) + '">' + (pct == null ? 'informe aulas e presenças' : br(pct) + '% · ' + rotuloFreq(pct)) + '</b>');
      var draft = lerDraft();
      var q = notaQualitativa(draft, pct, estado.config.pesos);
      var f = notaFinal(aluno.media, q, estado.config.pesoNota);
      $('fqNota').innerHTML = '<div><span>Nota acadêmica</span><strong>' + br(aluno.media) + '</strong><small>não é substituída</small></div><div><span>Nota qualitativa</span><strong>' + br(q) + '</strong><small>' + esc(classificar(q)) + '</small></div><div><span>Nota final</span><strong>' + br(f) + '</strong><small>acadêmica ' + estado.config.pesoNota.academica + '% + qualitativa ' + estado.config.pesoNota.qualitativa + '%</small></div>';
    }
    function lerDraft() {
      var d = {};
      CRITERIOS.forEach(function (c) {
        var marcado = document.querySelector('input[name="' + c.id + '"]:checked');
        d[c.id] = marcado ? Number(marcado.value) : null;
      });
      return d;
    }
    $('profFicha').oninput = atualizar;
    atualizar();
    $('fqEvol').innerHTML = grafico(aluno);
    $('fqFechar').onclick = function () { $('profFicha').hidden = true; };
    $('fqSalvar').onclick = function () {
      var prev = num($('fqPrev').value), pres = num($('fqPre').value), fal = num($('fqFal').value);
      if (prev != null && pres != null && (pres > prev || (fal != null && pres + fal > prev))) {
        $('fqErro').textContent = 'Frequência impossível: presenças + faltas não podem passar das aulas previstas.';
        $('fqErro').classList.add('visivel');
        return;
      }
      var payload = lerDraft();
      payload.turma = aluno.turma; payload.numero = aluno.numero; payload.nome = aluno.nome;
      payload.bimestre = Number($('profBim').value); payload.id = (aluno.avaliacao && aluno.avaliacao.id) || '';
      payload.aulasPrevistas = prev; payload.presencas = pres; payload.faltas = num($('fqFal').value);
      payload.observacao = $('fqObs').value.trim(); payload.data = new Date().toISOString().slice(0, 10);
      api({ action: 'professorEvaluation', token: estado.token, avaliacao: payload }).then(function (res) {
        if (!res.ok) { $('fqErro').textContent = res.error || 'Não salvou.'; $('fqErro').classList.add('visivel'); return; }
        estado.aviso = 'Avaliação de ' + aluno.nome + ' salva. A observação não entrou na nota.';
        carregar();
      }).catch(function () { $('fqErro').textContent = 'Falha ao salvar.'; $('fqErro').classList.add('visivel'); });
    };
  }
  function grafico(aluno) {
    var hist = (estado.pacote.historico || []).filter(function (h) { return String(h.numero) === String(aluno.numero) && h.turma === aluno.turma; });
    var pts = [1, 2, 3, 4].map(function (b) {
      var h = null;
      hist.forEach(function (x) { if (Number(x.bimestre) === b) h = x.qualitativa; });
      var acad = aluno.medias ? aluno.medias[b - 1] : null;
      var freq = null;
      hist.forEach(function (x) { if (Number(x.bimestre) === b && x.aulasPrevistas) freq = percentualFrequencia(x.presencas, x.aulasPrevistas); });
      var fin = notaFinal(acad, h, estado.config.pesoNota);
      return { b: b, acad: acad, qual: h, fin: fin, freq: freq };
    });
    var vals = pts.map(function (p) { return p.fin; });
    var max = 10;
    var barras = pts.map(function (p) {
      var h = p.fin == null ? 0 : Math.round((p.fin / max) * 100);
      return '<div><i style="height:' + h + '%"></i><span>B' + p.b + '<br>' + br(p.fin) + '</span></div>';
    }).join('');
    return '<h4>Evolução</h4><p>Tendência da nota final: <b>' + tendencia(vals) + '</b>. Bimestre sem lançamento fica em branco.</p><div class="prof-barras">' + barras + '</div>' +
      '<table><thead><tr><th>Bimestre</th><th>Acadêmica</th><th>Qualitativa</th><th>Frequência</th><th>Final</th></tr></thead><tbody>' +
      pts.map(function (p) { return '<tr><td>B' + p.b + '</td><td>' + br(p.acad) + '</td><td>' + br(p.qual) + '</td><td>' + (p.freq == null ? '—' : br(p.freq) + '%') + '</td><td>' + br(p.fin) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function renderRapida() {
    var alunos = alunosFiltrados();
    var html = '<p class="prof-lead">Toque o número de cada critério. 0/5/8/10 em atividades; 2/5/8/10 nos demais. Salva a turma inteira de uma vez.</p><div class="prof-rapida">';
    alunos.forEach(function (a, i) {
      var av = a.avaliacao || {};
      var completo = CRITERIOS.every(function (c) { return av[c.id] != null && av[c.id] !== ''; });
      html += '<article class="vidro" data-aluno="' + i + '"><header><b>' + esc(a.nome) + '</b><small>Nº ' + esc(a.numero) + ' · ' + (completo ? 'avaliado' : 'pendente') + '</small></header>';
      CRITERIOS.forEach(function (c) {
        html += '<div class="linha"><span>' + esc(c.nome) + '</span>';
        c.opcoes.forEach(function (op) {
          html += '<button type="button" class="' + (String(av[c.id]) === String(op[1]) ? 'on' : '') + '" data-c="' + c.id + '" data-v="' + op[1] + '">' + op[1] + '</button>';
        });
        html += '</div>';
      });
      html += '</article>';
    });
    html += '</div><button class="btn" type="button" id="salvarRapida">Salvar avaliação rápida</button><p class="erro" id="rapErro"></p>';
    $('profPainel').innerHTML = html;
    $('profPainel').onclick = function (ev) {
      var b = ev.target.closest('button[data-c]');
      if (!b) return;
      Array.prototype.forEach.call(b.parentNode.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    };
    $('salvarRapida').onclick = function () {
      var arts = $('profPainel').querySelectorAll('[data-aluno]');
      var fila = Array.prototype.map.call(arts, function (art) {
        var a = alunos[Number(art.getAttribute('data-aluno'))];
        var payload = { turma: a.turma, numero: a.numero, nome: a.nome, bimestre: Number($('profBim').value), id: (a.avaliacao && a.avaliacao.id) || '', data: new Date().toISOString().slice(0, 10), observacao: (a.avaliacao && a.avaliacao.observacao) || '' };
        CRITERIOS.forEach(function (c) {
          var on = art.querySelector('button.on[data-c="' + c.id + '"]');
          payload[c.id] = on ? Number(on.getAttribute('data-v')) : (a.avaliacao ? a.avaliacao[c.id] : null);
        });
        return api({ action: 'professorEvaluation', token: estado.token, avaliacao: payload });
      });
      Promise.all(fila).then(function () { estado.aviso = 'Avaliação rápida salva. Quem ficou sem critério continua pendente.'; carregar(); }).catch(function () { $('rapErro').textContent = 'Algum lançamento falhou.'; $('rapErro').classList.add('visivel'); });
    };
  }
  function renderFreq() {
    var alunos = alunosFiltrados();
    var hoje = new Date().toISOString().slice(0, 10);
    var html = '<div class="prof-filtros"><label>Data da aula<input id="freqData" type="date" value="' + hoje + '"></label></div><div class="prof-chamada">';
    alunos.forEach(function (a, i) {
      html += '<div class="vidro"><b>' + esc(a.nome) + '</b><div><button type="button" data-i="' + i + '" data-m="P">P</button><button type="button" data-i="' + i + '" data-m="F">F</button><button type="button" data-i="' + i + '" data-m="J">J</button></div><small>acumulado ' + (a.frequencia && a.frequencia.percentual != null ? br(a.frequencia.percentual) + '% · ' + rotuloFreq(a.frequencia.percentual) : 'sem chamada') + '</small></div>';
    });
    html += '</div><button class="btn" id="salvarFreq" type="button">Salvar chamada</button><p class="prof-lead">P presente · F falta · J falta justificada. A frequência acumulada conta P sobre as aulas lançadas. J fica registrada à parte e não entra como presença.</p>';
    $('profPainel').innerHTML = html;
    var marcas = {};
    $('profPainel').onclick = function (ev) {
      var b = ev.target.closest('button[data-m]');
      if (!b) return;
      marcas[b.getAttribute('data-i')] = b.getAttribute('data-m');
      Array.prototype.forEach.call(b.parentNode.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
    };
    $('salvarFreq').onclick = function () {
      var faltou = alunos.some(function (a, i) { return !marcas[i]; });
      if (faltou) { $('profPainel').insertAdjacentHTML('beforeend', '<p class="erro visivel">Marque P, F ou J em todos antes de salvar. Ninguém é lançado como presente automaticamente.</p>'); return; }
      var chamada = alunos.map(function (a, i) { return { nome: a.nome, numero: a.numero, marca: marcas[i] }; });
      api({ action: 'professorFrequency', token: estado.token, turma: $('profTurma').value, data: $('freqData').value, chamada: chamada }).then(function (res) {
        if (!res.ok) { $('profPainel').insertAdjacentHTML('beforeend', '<p class="erro visivel">' + esc(res.error || 'Não salvou.') + '</p>'); return; }
        estado.aviso = 'Chamada salva. Frequência limitada a 100%.';
        carregar();
      });
    };
  }
  function renderPesos() {
    var p = estado.config.pesos, n = estado.config.pesoNota;
    var campos = [['atividades', 'Atividades'], ['participacao', 'Participação'], ['comportamento', 'Comportamento'], ['respeito', 'Respeito'], ['responsabilidade', 'Responsabilidade'], ['frequencia', 'Frequência']];
    var html = '<form class="vidro" id="formPesos"><p class="prof-lead">Os critérios da nota qualitativa somam 100%. A nota final soma o peso acadêmico e o qualitativo, também 100%. A nota acadêmica da planilha não é substituída.</p><p id="pesoSoma" class="prof-lead"></p>';
    campos.forEach(function (c) { html += '<label>' + c[1] + '<input name="' + c[0] + '" type="number" min="0" max="100" value="' + p[c[0]] + '">%</label>'; });
    html += '<label>Peso da nota acadêmica<input name="academica" type="number" min="0" max="100" value="' + n.academica + '">%</label><label>Peso da avaliação qualitativa<input name="qualitativa" type="number" min="0" max="100" value="' + n.qualitativa + '">%</label><button class="btn" type="submit">Salvar pesos</button><p class="erro" id="pesoErro"></p></form>';
    $('profPainel').innerHTML = html;
    function lerPesos() {
      var fd = new FormData($('formPesos'));
      var pesos = {};
      campos.forEach(function (c) { pesos[c[0]] = Number(fd.get(c[0])); });
      var pesoNota = { academica: Number(fd.get('academica')), qualitativa: Number(fd.get('qualitativa')) };
      var soma = campos.reduce(function (s, c) { return s + Number(pesos[c[0]] || 0); }, 0);
      var somaFinal = Number(pesoNota.academica || 0) + Number(pesoNota.qualitativa || 0);
      $('pesoSoma').textContent = 'Critérios: ' + soma + '%. Nota final: acadêmica ' + pesoNota.academica + '% + qualitativa ' + pesoNota.qualitativa + '% = ' + somaFinal + '%.';
      return { pesos: pesos, pesoNota: pesoNota, soma: soma, somaFinal: somaFinal };
    }
    $('formPesos').oninput = lerPesos;
    lerPesos();
    $('formPesos').onsubmit = function (ev) {
      ev.preventDefault();
      var dados = lerPesos();
      if (Math.round(dados.soma) !== 100) { $('pesoErro').textContent = 'A soma dos critérios precisa ser exatamente 100%. Agora está em ' + dados.soma + '%.'; $('pesoErro').classList.add('visivel'); return; }
      if (Math.round(dados.somaFinal) !== 100) { $('pesoErro').textContent = 'Peso acadêmico + qualitativo precisa ser exatamente 100%. Agora está em ' + dados.somaFinal + '%.'; $('pesoErro').classList.add('visivel'); return; }
      api({ action: 'professorConfig', token: estado.token, salvar: true, pesos: dados.pesos, pesoNota: dados.pesoNota }).then(function (res) {
        if (!res.ok) { $('pesoErro').textContent = res.error || 'Não salvou.'; $('pesoErro').classList.add('visivel'); return; }
        estado.config = res.config; estado.aviso = 'Pesos salvos. As notas visíveis foram recalculadas.'; carregar();
      });
    };
  }
  function linhasExport() {
    return alunosFiltrados().map(function (a) {
      var av = a.avaliacao || {};
      return [a.nome, a.turma, a.numero, $('profBim').value, br(a.media), av.atividades, av.participacao, av.comportamento, av.respeito, av.responsabilidade, a.frequencia && a.frequencia.percentual != null ? br(a.frequencia.percentual) + '%' : '', br(a.qualitativa), br(a.notaFinal), a.situacao || '', av.observacao || ''];
    });
  }
  var CAB = ['Aluno', 'Turma', 'Número', 'Bimestre', 'Nota acadêmica', 'Atividades', 'Participação', 'Comportamento', 'Respeito', 'Responsabilidade', 'Frequência', 'Nota qualitativa', 'Nota final', 'Situação', 'Observação'];
  function renderExportar() {
    $('profPainel').innerHTML = '<div class="vidro"><p class="prof-lead">A exportação pede a lista autorizada nesta sessão. No modo real, o servidor revalida o token antes de devolver os dados.</p><div class="prof-acoes"><button class="btn" type="button" id="expCsv">CSV</button><button class="btn" type="button" id="expXls">Excel</button><button class="btn" type="button" id="expPdf">PDF</button></div><p class="erro" id="expErro"></p></div>';
    function comLinhas(cb) {
      if (PREVIEW) { cb(linhasExport()); return; }
      api({ action: 'professorExport', token: estado.token, turma: $('profTurma').value, bimestre: $('profBim').value }).then(function (res) {
        if (!res.ok) { $('expErro').textContent = res.error || 'Acesso negado.'; $('expErro').classList.add('visivel'); return; }
        cb((res.linhas || []).map(function (a) {
          var av = a.avaliacao || {};
          return [a.nome, a.turma, a.numero, res.bimestre, br(a.media), av.atividades, av.participacao, av.comportamento, av.respeito, av.responsabilidade, a.frequencia && a.frequencia.percentual != null ? br(a.frequencia.percentual) + '%' : '', br(a.qualitativa), br(a.notaFinal), a.situacao || '', av.observacao || ''];
        }));
      }).catch(function () { $('expErro').textContent = 'Não foi possível exportar.'; $('expErro').classList.add('visivel'); });
    }
    $('expCsv').onclick = function () { comLinhas(function (ls) { baixar('missao-orbital.csv', '\uFEFF' + [CAB].concat(ls).map(csvLinha).join('\n'), 'text/csv'); }); };
    $('expXls').onclick = function () { comLinhas(function (ls) { baixar('missao-orbital.xls', planilhaXml(ls), 'application/vnd.ms-excel'); }); };
    $('expPdf').onclick = function () { comLinhas(function (ls) { baixar('missao-orbital.pdf', pdfSimples(ls), 'application/pdf'); }); };
  }
  function csvLinha(cols) { return cols.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }
  function baixar(nome, conteudo, tipo) {
    var blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function planilhaXml(ls) {
    var linhas = [CAB].concat(ls || linhasExport()).map(function (r) {
      return '<Row>' + r.map(function (c) { return '<Cell><Data ss:Type="String">' + esc(c) + '</Data></Cell>'; }).join('') + '</Row>';
    }).join('');
    return '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Missao"><Table>' + linhas + '</Table></Worksheet></Workbook>';
  }
  function pdfSimples(ls) {
    var linhas = [CAB.join(' | ')].concat((ls || linhasExport()).map(function (r) { return r.join(' | '); }));
    var y = 800, cmds = ['BT /F1 11 Tf 40 ' + y + ' Td (' + pdfEsc('Missao Orbital - Cantinho do Professor') + ') Tj ET'];
    linhas.forEach(function (linha, i) {
      y = 770 - i * 16;
      if (y < 40) return;
      cmds.push('BT /F1 9 Tf 40 ' + y + ' Td (' + pdfEsc(linha.slice(0, 140)) + ') Tj ET');
    });
    var stream = cmds.join('\n');
    var objetos = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1190] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      '4 0 obj << /Length ' + stream.length + ' >> stream\n' + stream + '\nendstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
    ];
    var pdf = '%PDF-1.4\n', offs = [0];
    objetos.forEach(function (o) { offs.push(pdf.length); pdf += o + '\n'; });
    var xref = pdf.length;
    pdf += 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n';
    offs.slice(1).forEach(function (o) { pdf += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    pdf += 'trailer << /Size ' + (objetos.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return pdf;
  }
  function pdfEsc(s) {
    var mapa = { 'á':'\\341','à':'\\340','ã':'\\343','â':'\\342','ä':'\\344','é':'\\351','ê':'\\352','í':'\\355','ó':'\\363','ô':'\\364','õ':'\\365','ú':'\\372','ç':'\\347','Á':'\\301','À':'\\300','Ã':'\\303','Â':'\\302','É':'\\311','Ê':'\\312','Í':'\\315','Ó':'\\323','Ô':'\\324','Õ':'\\325','Ú':'\\332','Ç':'\\307','—':'-','·':'-' };
    return String(s).replace(/[\\()]/g, function (c) { return '\\' + c; }).replace(/[^\x20-\x7E]/g, function (ch) { return mapa[ch] || '?'; });
  }

  function previewApi(post) {
    if (!window.__moPreview) window.__moPreview = previewBase();
    var db = window.__moPreview;
    var mapa = { professorLogin:'profLogin', professorStudents:'profTurma', professorEvaluation:'profSalvar', professorFrequency:'profFrequencia', professorConfig:'profConfig', professorExport:'profExport' };
    if (mapa[post.action]) post.action = mapa[post.action];
    if (post.action === 'profLogin') {
      if (post.senha !== 'orbita-preview') return Promise.resolve({ ok: false, error: 'Acesso negado.' });
      return Promise.resolve({ ok: true, token: 'a'.repeat(64), professor: 'Professor Silas', anoLetivo: 2026 });
    }
    if (post.token !== 'a'.repeat(64)) return Promise.resolve({ ok: false, error: 'Sessão inválida.' });
    if (post.action === 'profSessao') return Promise.resolve({ ok: true, professor: 'Professor Silas' });
    if (post.action === 'profConfig' && post.salvar) {
      var soma = ['atividades','participacao','comportamento','respeito','responsabilidade','frequencia'].reduce(function (s, k) { return s + Number(post.pesos[k] || 0); }, 0);
      var somaNota = Number(post.pesoNota.academica) + Number(post.pesoNota.qualitativa);
      if (Math.round(soma) !== 100) return Promise.resolve({ ok: false, error: 'A soma dos critérios precisa ser exatamente 100%.' });
      if (Math.round(somaNota) !== 100) return Promise.resolve({ ok: false, error: 'Peso acadêmico + qualitativo precisa ser exatamente 100%.' });
      db.config.pesos = post.pesos; db.config.pesoNota = post.pesoNota; return Promise.resolve({ ok: true, config: db.config });
    }
    if (post.action === 'profSalvar') {
      var id = post.avaliacao.turma + '|' + post.avaliacao.numero + '|' + post.avaliacao.bimestre;
      post.avaliacao.id = id; post.avaliacao.atualizadoEm = new Date().toISOString(); post.avaliacao.professor = 'Professor Silas';
      db.avals = db.avals.filter(function (a) { return a.id !== id; }).concat([post.avaliacao]);
      return Promise.resolve({ ok: true, id: id });
    }
    if (post.action === 'profFrequencia') { db.freqs.push(post); return Promise.resolve({ ok: true }); }
    if (post.action === 'profExport') {
      var pacote = previewTurma(db, post);
      return Promise.resolve({ ok: true, linhas: pacote.alunos, bimestre: pacote.bimestre, turma: pacote.turma });
    }
    if (post.action === 'profTurma') return Promise.resolve(previewTurma(db, post));
    return Promise.resolve({ ok: false, error: 'Ação desconhecida.' });
  }
  function previewBase() {
    return {
      config: { pesos: Object.assign({}, PESOS_PADRAO), pesoNota: Object.assign({}, PESO_NOTA_PADRAO) },
      alunos: [
        { turma: '1 A-ELETROTÉCNICA', numero: '1', nome: 'Ana Preview', medias: [7.5, 8, 7.2, null] },
        { turma: '1 A-ELETROTÉCNICA', numero: '2', nome: 'Bruno Preview', medias: [5, 5.5, 6, null] },
        { turma: '1 A-ELETROTÉCNICA', numero: '3', nome: 'Carla Preview', medias: [4, 4.5, 4.2, null] }
      ],
      avals: [], freqs: []
    };
  }
  function previewTurma(db, post) {
    var turma = post.turma || '1 A-ELETROTÉCNICA';
    var bim = Number(post.bimestre || 3);
    var alunos = db.alunos.filter(function (a) { return a.turma === turma; }).map(function (al) {
      var av = null;
      db.avals.forEach(function (x) { if (x.turma === al.turma && String(x.numero) === String(al.numero) && Number(x.bimestre) === bim) av = x; });
      var fr = { previstas: 0, presencas: 0, faltas: 0, justificadas: 0, percentual: null };
      db.freqs.forEach(function (f) {
        if (f.turma !== turma) return;
        (f.chamada || []).forEach(function (c) {
          if (String(c.numero) !== String(al.numero)) return;
          fr.previstas++;
          if (c.marca === 'P') fr.presencas++; else if (c.marca === 'J') fr.justificadas++; else fr.faltas++;
        });
      });
      if (av && av.aulasPrevistas) { fr.previstas = Number(av.aulasPrevistas); fr.presencas = Number(av.presencas || 0); fr.faltas = Number(av.faltas || 0); }
      fr.percentual = percentualFrequencia(fr.presencas, fr.previstas);
      var qual = av ? notaQualitativa(av, fr.percentual, db.config.pesos) : null;
      var fin = notaFinal(al.medias[bim - 1], qual, db.config.pesoNota);
      return { turma: al.turma, numero: al.numero, nome: al.nome, medias: al.medias, media: al.medias[bim - 1], avaliacao: av, frequencia: fr, qualitativa: qual, notaFinal: fin, situacao: situacao(fin) };
    });
    return { ok: true, turma: turma, bimestre: bim, anoLetivo: 2026, turmas: ['1 A-ELETROTÉCNICA'], config: db.config, alunos: alunos, historico: db.avals };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('btnProfessor');
    if (btn) btn.addEventListener('click', abrir);
    var voltar = $('profVoltar');
    if (voltar) voltar.addEventListener('click', fechar);
    estado.token = sessionStorage.getItem('mo_prof_token') || '';
    estado.professor = sessionStorage.getItem('mo_prof_nome') || '';
    if (estado.token && /[?&]professor=1/.test(location.search)) abrir();
  });
  window.MissaoProfessor = { notaQualitativa: notaQualitativa, notaFinal: notaFinal, classificar: classificar, situacao: situacao, notaFrequencia: notaFrequencia };
})();
