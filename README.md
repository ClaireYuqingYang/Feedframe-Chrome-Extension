This is a web demo we used in pilot study.
We embeded the html index.html inside a qualtrics block using javascript toggle/qualtrics_embed.js.

UI: toggle/index.html is the participant-facing page.

Embed: In Qualtrics, qualtrics_embed.js injects an <iframe> that loads index.html with ?pid=....

Event flow: The page sends interaction events to the parent using window.postMessage (ff_log, ff_log_bulk).

Collect & compute: The Qualtrics script listens, de-duplicates, orders by time, labels mode (news/all), and computes dwell time + click counts.

Autosave: On Next / pagehide / beforeunload / visibilitychange and every 5s, it requests a dump from the child page and writes summaries + raw logs to Embedded Data (chunked):
ff_log_json_1..n, ff_log_json_n, ff_log_json_len, ff_time_news_sec, ff_time_all_sec, ff_time_total_sec, ff_like_*, ff_retweet_*, etc.

Safety: Code is guarded to run only inside Qualtrics; opening index.html alone does not attempt data writes.