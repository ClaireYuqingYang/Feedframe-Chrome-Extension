Qualtrics.SurveyEngine.addOnload(function () {
  var that = this;

  /* =========================================================
   * A) Toast (Disabled: do not show any prompt)
   * ========================================================= */
  var FFToast = { show: function(){} };
  function toastOnce(){ /* no-op: disable all toast */ }

  /* =========================================================
   * B) Participant ID (from embedded fields)
   * ========================================================= */
  var pid = Qualtrics.SurveyEngine.getEmbeddedData('ProlificPID')
        || Qualtrics.SurveyEngine.getEmbeddedData('WorkerId')
        || Qualtrics.SurveyEngine.getEmbeddedData('ResponseID');

  /* =========================================================
   * C) Create iframe (your GitHub Pages page)
   * ========================================================= */
  var iframe = document.createElement('iframe');
  iframe.src = 'https://claireyuqingyang.github.io/JPPM_Pilot_Toggle/?pid=' + encodeURIComponent(pid || '');
  iframe.style.width = '100%';
  iframe.style.height = '650px';
  iframe.style.border = '0';
  this.getQuestionTextContainer().innerHTML = '';
  this.getQuestionTextContainer().appendChild(iframe);

  /* =========================================================
   * D) Collect child-page events (postMessage)
   * ========================================================= */
  var logs = [];
  function pushLogs(arr){
    var seen = new Set(logs.map(function(x){ return (x.ts || '') + '|' + (x.action || ''); }));
    arr.forEach(function(ev){
      var k = (ev.ts || '') + '|' + (ev.action || '');
      if (!seen.has(k)) { logs.push(ev); seen.add(k); }
    });
  }

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg) return;
    if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch(_){} }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ff_log') {
      pushLogs([msg]);
      // (No more prompt popup)
    } else if (msg.type === 'ff_log_bulk' && Array.isArray(msg.payload)) {
      pushLogs(msg.payload);
      // (No more prompt popup)
    }
  });

  /* =========================================================
   * E) Request dump from child page (ask child page to send current cached events)
   * ========================================================= */
  function requestDump(){
    try { iframe.contentWindow.postMessage({ type: 'ff_request_dump' }, '*'); } catch(e){}
  }

  /* =========================================================
   * F) Save to embedded fields (chunking + duration calculation + interactions by mode)
   * ========================================================= */
  function saveToEmbedded(reason) {
    try {
      // F.1 Compact actions
      var compact = logs.map(function(ev){
        var a = ev.action || '';
        var d = ev.detail || {};
        var rec = { a: a, ts: ev.ts || null, id: d.tweetId || null };
        if ('active' in d) rec.active = !!d.active;
        if (d.mode === 'news' || d.mode === 'all') rec.mode = d.mode;
        if (a === 'send_comment') {
          rec.comment = (d.comment || '').replace(/[\u0000-\u001F\u2028\u2029]/g, ' ').slice(0, 800);
        }
        return rec;
      });

      // F.2 Add mode labels to actions and calculate durations
      var arr = compact.filter(function(e){ return e && e.ts; }).slice()
                       .sort(function(a,b){ return new Date(a.ts) - new Date(b.ts); });
      var newsMs=0, allMs=0, firstTs=null, lastTs=null;
      if (arr.length > 0) {
        var cur = (arr[0].mode==='all'||arr[0].mode==='news') ? arr[0].mode : 'news';
        var t0 = +new Date(arr[0].ts);
        firstTs = arr[0].ts;
        arr[0].m = cur;

        for (var i=1;i<arr.length;i++){
          var t1 = +new Date(arr[i].ts);
          var dt = Math.max(0, t1 - t0);
          if (cur==='news') newsMs+=dt; else allMs+=dt;

          arr[i].m = (arr[i].mode==='news'||arr[i].mode==='all') ? arr[i].mode : cur;
          if (arr[i].mode==='news'||arr[i].mode==='all') cur=arr[i].mode;
          else if (arr[i].a==='toggle_mode') cur=(cur==='news')?'all':'news';

          t0=t1;
        }
        var tail = Math.max(0, Date.now()-t0);
        if (cur==='news') newsMs+=tail; else allMs+=tail;
        lastTs = arr[arr.length-1].ts;
      }
      var time_news_sec  = Math.round(newsMs/1000);
      var time_all_sec   = Math.round(allMs/1000);
      var time_total_sec = time_news_sec + time_all_sec;

      // F.3 Summarize interaction counts by mode
      var summary = {
        click_like:     {news:0,all:0},
        click_retweet:  {news:0,all:0},
        click_comment:  {news:0,all:0},
        click_stats:    {news:0,all:0},
        send_comment:   {news:0,all:0}
      };
      arr.forEach(function(ev){
        var m = ev.m || ev.mode;
        if (m!=='news'&&m!=='all') return;
        if (summary[ev.a]) summary[ev.a][m]++;
      });

      // F.4 JSON payload
      var payload = {
        pid: pid || null,
        reason: reason || 'autosave',
        t: new Date().toISOString(),
        first_ts: firstTs,
        last_ts: lastTs,
        time_news_sec: time_news_sec,
        time_all_sec:  time_all_sec,
        time_total_sec: time_total_sec,
        count: compact.length,
        summary_by_mode: summary,
        actions: arr
      };
      var json = JSON.stringify(payload);

      // F.5 Chunked write (≤900)
      var CHUNK=900, i=1, off=0, MAX_PARTS=20;
      while(off<json.length && i<=MAX_PARTS){
        Qualtrics.SurveyEngine.setJSEmbeddedData('ff_log_json_'+i, json.slice(off,off+CHUNK));
        i++; off+=CHUNK;
      }
      for(var k=i;k<=MAX_PARTS;k++){ Qualtrics.SurveyEngine.setJSEmbeddedData('ff_log_json_'+k, ''); }
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_log_json_n', i-1);
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_log_json_len', json.length);
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_log_last_saved_ts', new Date().toISOString());

      // F.6 Separate embedded fields (for easier direct analysis)
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_time_news_sec',  String(time_news_sec));
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_time_all_sec',   String(time_all_sec));
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_time_total_sec', String(time_total_sec));
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_like_news',    String(summary.click_like.news));
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_like_all',     String(summary.click_like.all));
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_retweet_news', String(summary.click_retweet.news));
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_retweet_all',  String(summary.click_retweet.all));

    } catch(e) {
      Qualtrics.SurveyEngine.setJSEmbeddedData('ff_error','save:'+ (e&&e.message||e));
    }
  }

  function requestThenSave(r){ requestDump(); setTimeout(function(){ saveToEmbedded(r); },200); }

  /* =========================================================
   * G) Next / unload events: try to save when leaving page
   * ========================================================= */
  var nextBtn = this.getNextButton && this.getNextButton();
  if(nextBtn){ nextBtn.addEventListener('click',function(){ requestThenSave('next'); },true); }
  window.addEventListener('pagehide',function(){ requestThenSave('pagehide'); });
  window.addEventListener('beforeunload',function(){ requestThenSave('beforeunload'); });
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){ requestThenSave('hidden'); }
  });

  /* =========================================================
   * H) Heartbeat: every 5 seconds pull dump and autosave
   * ========================================================= */
  var autosaveTimer = setInterval(function(){
    requestDump();
    setTimeout(function(){ saveToEmbedded('autosave'); },150);
  },5000);
  this.addOnUnload(function(){ try{ clearInterval(autosaveTimer); }catch(e){} });
});