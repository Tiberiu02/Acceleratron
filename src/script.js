// ==UserScript==
// @name         Acceleratron
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Learn with GPT-3!
// @author       Tiberiu Musat
// @match        https://www.youtube.com
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?domain=tampermonkey.net
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // 1. Get your OpenAI API key at https://beta.openai.com/account/api-keys
  // 2. Put it between the quotes on the line below:
  let OPENAI_API_KEY = "your OpenAI API key here";

  let qGenPrompt =
`Turn the following statements into questions. Provide the correct answer, as well as 3 incorrect and different alternatives separated by semicolon.
"""
Statement: In 1709, England passed the Statute of Anne, which is widely considered to be the first copyright law.
Question: In what year was the Statute of Anne passed?
Correct answer: 1709
Incorrect alternatives: 1609; 1809; 1904
"""
Statement: The Statute of Anne was the first law to grant ownership rights to individual authors rather than to publishers or printers.
Question: What was the first law to grant ownership rights to individual authors?
Correct answer: The Statute of Anne
Incorrect alternatives: The US Patent Act; The US Constitution; The US Copyright Act
"""
Statement: In 1995, a sixth right, digital audio transmission was created.
Question: When was the digital audio transmission right created?
Correct answer: In 1995
Incorrect alternatives: In 1990; In 2000; In 2005
"""
Statement:  Under the most recent version of the US Copyright Law, these exclusive rights last for the lifetime of the author plus 70 years.
Question: What is the duration of copyright in the United States?
Correct answer: Life + 70 years
Incorrect alternatives: Life + 100 years; Life + 50 years; Life + 75 years
"""
Statement: Roomba is a registered trademark of the iRobot Corporation.
Question: Who owns the Roomba trademark?
Correct answer: The iRobot Corporation
Incorrect alternatives: The Roomba Corporation; The eRobot Corporation; The US government
"""
Statement:
1. Ants have a complex social structure based on a system of pheromones.
2. Ants are social insects that live in colonies.
3. Ants are a good example of how simple, decentralized systems can be extremely effective.
4. Ants are great at solving problems that require a lot of cooperation and coordination.
5. Agriculture allowed for the development of cities and the creation of large scale economies.
"""
1.
Question: How do ants communicate?
Correct answer: Pheromones
Incorrect alternatives: Body language; Sound waves; Smell
2.
Question: What are ants?
Correct answer: Social insects
Incorrect alternatives: Plankton; Reptiles; Bacteria
3.
Question: What is the system of organisation that ants use?
Correct answer: A decentralized system
Incorrect alternatives: A centralized system; A hierarchy; A monarchy
4.
Question: What makes ants good at solving problems?
Correct answer: Cooperation and coordination
Incorrect alternatives: Individual initiative; Intelligence; Competition
5.
Question: What developed as a direct consequence of agriculture?
Correct answer: Cities and large scale economies
Incorrect alternatives: Nations states; Small scale economies; Tribes and bands
"""
Statement:
$INPUT$
"""
1.
Question:`;

  // useful for testing parts of the script without calling GPT3 API
  let useSampleQuestions = false;
  let sampleQuestions = [
      {
          "Question": "What are the two things that a video must have in order to go viral?",
          "Correct answer": "Good titles and thumbnail images",
          "Incorrect alternatives": ["Good content and advertising", "Good titles and descriptions", "Likes and comments"]
      },
      {
          "Question": "What is the key to making a video go viral?",
          "Correct answer": "Increasing the click-through rate",
          "Incorrect alternatives": ["Quality of the video", "Quantity of the videos", "Quantity of the videos"]
      },
      {
          "Question": "What should a creator do in order to increase the click-through rate of their videos?",
          "Correct answer": "Use clickable titles and thumbnails",
          "Incorrect alternatives": ["Make good videos", "Use social media platforms", "Promote their videos"]
      },
  ];

  let getParams = () => {
      var result = {};
      var tmp = [];

      location.search
          .substr (1)
          .split ("&")
          .forEach (function (item)
                    {
          tmp = item.split ("=");
          result [tmp[0]] = decodeURIComponent (tmp[1]);
      });

      return result;
  };

  let getSubtitles = async () => {

      let extractBaseUrl = (html) => {
          let splittedHtml = html.split('"captions":');

          if (splittedHtml.length > 1) {
              let videoDetails = splittedHtml[1].split(',"videoDetails')[0].replaceAll('\n', '');
              let jsonObj = JSON.parse(videoDetails);
              let captions = jsonObj.playerCaptionsTracklistRenderer.captionTracks;
              // Return English subtitles if any
              for (let i = 0; i < captions.length; i++) {
                  console.log(captions[i].vssId);
                  if (captions[i].vssId.startsWith(".en"))
                      return captions[i].baseUrl;
              }
          }

          return null;
      }

      let decodeXML = function (html) {
          let div = document.createElement('div');
          for (let i = 0; i < 3; i++) {
              div.innerHTML = html;
              html = div.innerText;
          }
          return html;
      };

      let params = getParams();
      let videoId = params.v;
      let videoUrl = "https://www.youtube.com/watch?v=" + videoId;

      let resp = await fetch(videoUrl);
      let html = await resp.text();

      let baseUrl = extractBaseUrl(html);
      if (baseUrl == null)
          return null;
      console.log(baseUrl);

      resp = await fetch(baseUrl);
      let xml = await resp.text();

      // curate subtitles
      xml = xml.replaceAll('>', '> ').replaceAll('<', ' <');
      let subtitles = decodeXML(xml)
      subtitles = subtitles.replaceAll(/[‘’]/g, "'");
      subtitles = subtitles.replaceAll(/[“”]/g, '"');
      subtitles = subtitles.replaceAll(/\[[^\[\]]*\]/g, ' '); // [Music]
      subtitles = subtitles.replaceAll('♪', ' ');
      subtitles = subtitles.replaceAll('\n', ' ');
      subtitles = subtitles.replaceAll(/[ ]+/g, ' ').trim();

      return subtitles;
  }

  let GPT3 = async (engine, opts) => {
      const url = `https://api.openai.com/v1/engines/${engine}/completions`;
      const init = {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + OPENAI_API_KEY
          },
          body: JSON.stringify(opts)
      };
      let resp = await fetch(url, init);
      resp = await resp.json();
      console.log(resp);
      return resp.choices[0].text;
  }

  let generateSummary = async (text, engine) => {

      let parseIndexedList = (text) => {
          text = text.replaceAll('\n\n', '\n').split('\n');
          text = text.map(x => x.replace(/^\d+\./, '').trim()) // remove indexing
          text = text.map(x => x.replace(/./, c => c.toUpperCase())) // capitalize first letter
          text = text.map(x => (/[\.?!;,]['\"]*$/.test(x) ? x : x + '.')); // add missing punctuation
          return text;
      }

      let n = Math.ceil(text.length / 5000);
      let d = Math.ceil(text.length / n);
      if (text.length > 30000) {
          n = 6;
          d = 5000;
      }

      let summary = [];
      for (let i = 0; i < n; i++) {
          const subText = text.substring(i * d, (i + 1) * d);
          const prompt = `The following is the transcript of a YouTube video.\n"""\n${subText}\n"""\nSummarize the transcript above and boil it down to the most important 5 key facts.\n"""\n1.`;
          const opts = {
              prompt: prompt,
              temperature: 0.5,
              max_tokens: 400,
              top_p: 1,
              frequency_penalty: 0.2,
              presence_penalty: 0,
              stop: ["\"\"\""]
          };
          let subSummary = await GPT3(engine, opts);
          summary = summary.concat(parseIndexedList(subSummary));
      }
      console.log(summary);
      return summary;
  }

  let generateQuestions = async (subtitles) => {
      if (useSampleQuestions)
          return sampleQuestions;

      // Extract key facts
      let summary = await generateSummary(subtitles, "curie-instruct-beta-v2");
      let intermediateSummary = "";
      if (summary.length > 5) {
          intermediateSummary = summary;
          summary = await generateSummary(summary.join(' '), "davinci-instruct-beta-v3");
      }

      // Synthesize questions
      let input = summary.map((x, i) => (i + 1) + ". " + x).join('\n');
      let prompt = qGenPrompt.replace('$INPUT$', input);
      console.log(prompt);
      const opts = {
          prompt: prompt,
          temperature: 0.7,
          max_tokens: 400,
          top_p: 1,
          frequency_penalty: 0.2,
          presence_penalty: 0,
          stop: ["\"\"\""]
      };
      let t = "Question:" + await GPT3("davinci-instruct-beta-v3", opts);
      console.log(t);

      // Parse questions
      t = t.replaceAll('\n\n', '\n');
      t = t.split(/\n\d+\./);
      let questions = [];
      t.forEach(q => {
          q = q.trim();
          let qObj = {};
          q.split('\n').forEach(line => {
              let s = line.split(':', 2);
              if (s.length == 2)
                  qObj[s[0].trim()] = s[1].trim();
          });
          if ('Question' in qObj && 'Correct answer' in qObj && 'Incorrect alternatives' in qObj) {
              let a = qObj['Incorrect alternatives'].split(';').map(x => x.trim());
              //console.log(a);
              a = a.filter((value, index) => a.indexOf(value) == index && value != qObj['Correct answer']); // remove duplicates;
              qObj['Incorrect alternatives'] = a;
              if (a.length > 0)
                  questions.push(qObj);
          }
      });
      console.log(questions);

      return questions;
  }

  // get an HTML element by waiting if not yet present
  let getElement = (doc, query) => {
      return new Promise((success, fail) => {
          let i;
          let attempt = () => {
              let e = doc.querySelector(query);
              if (e != null) {
                  clearInterval(i);
                  success(e);
              }
          }
          i = setInterval(attempt, 100);
      });
  }

  let createButton = () => {
      let btn = document.createElement("tp-yt-paper-button"); // leverage YT stylings
      btn.style.backgroundColor = "#0a0";
      btn.style.fontSize = "1.4rem";
      btn.style.fontWeight = "500";
      btn.style.letterSpacing = ".5px";
      btn.style.color = "#FFF";
      btn.style.padding = "5px 8px";
      return btn;
  };

  let subtitles;
  let displayQuestions = async () => {
      let darkMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

      // Create new section for questions
      let mainDiv = await getElement(document, "#primary-inner");
      let metaDiv = await getElement(mainDiv, "#meta");
      let newDiv = document.createElement("ytd-video-primary-info-renderer");
      newDiv.classList.add("style-scope");
      newDiv.classList.add("ytd-watch-flexy");
      newDiv.style.fontSize = "1.4rem";
      newDiv.style.fontWeight = "400";
      newDiv.style.letterSpacing = ".5px";
      newDiv.style.color = (darkMode ? "#fff" : "#030303");
      newDiv.style.paddingBottom = "16px";
      newDiv.style.textAlign = "center";
      mainDiv.insertBefore(newDiv, metaDiv);
      registeredElements.push(newDiv);

      // Display spinner animation while generating questions
      let spinner = document.createElement('tp-yt-paper-spinner');
      spinner.setAttribute('active', '');
      newDiv.replaceChildren(spinner);
      registeredElements.push(spinner);

      try {
          let questions = await generateQuestions(subtitles);

          let correctAnswers = 0;
          let showQuestion = (qIx) => {
              if (qIx == 0) {
                  spinner.remove();
                  registeredElements.pop(spinner);
                  newDiv.style.textAlign = "left";
              }
              if (qIx == questions.length) {
                  newDiv.innerHTML = `<span style="font-weight:500;">You correctly answered ${correctAnswers} out of ${questions.length} questions. Keep going!</span>`;
                  questions.forEach((q, ix) => {
                      newDiv.innerHTML += `<br><br>${ix + 1}. ${q.Question}`;
                      q['Incorrect alternatives'].forEach(a => { newDiv.innerHTML += `<br>Incorrect: ${a}`; });
                      newDiv.innerHTML += `<br>Correct: ${q['Correct answer']}`;
                  });
                  return;
              }

              let q = questions[qIx];
              let a = q['Incorrect alternatives'].concat(q['Correct answer']);
              a.sort(() => Math.random() - 0.5); // shuffle answers

              newDiv.innerHTML = `<p style="font-weight:500;margin-bottom:15px">${q.Question}</p>`;

              let correctEl, selectedEl;
              a = a.forEach(x => {
                  let option = document.createElement('label');
                  option.style.display = "flex";
                  option.style.flexDirection = "row";
                  option.style.alignItems = "center";
                  option.style.margin = "5px 0px";

                  let input = document.createElement('input');
                  input.value = x;
                  input.type = 'radio';
                  input.name = 'vidquestion';
                  input.style.verticalAlign = "top";
                  input.style.margin = "0px 5px";
                  option.appendChild(input);

                  let p = document.createElement('p');
                  p.style.lineHeight = '2.2rem';
                  p.innerHTML = x;//.repeat(10);
                  option.appendChild(p);

                  newDiv.appendChild(option);
                  if (x == q['Correct answer'])
                      correctEl = p;
                  input.onclick = (ev) => {
                      if (verdict.style.display != "none")
                          ev.preventDefault();
                      console.log(ev);
                      selectedEl = p;
                      res.style.display = "flex";
                  };
              });

              let res = document.createElement('div');
              res.style.flexDirection = "row";
              res.style.alignItems = "center";
              res.style.display = "none";
              res.style.marginTop = "15px";
              res.style.gridGap = "15px";
              res.style.display = "none";
              newDiv.append(res);

              let verdict = document.createElement('p');
              verdict.innerHTML = "Correct!";
              verdict.style.fontWeight = 500;
              verdict.style.display = "none";
              res.appendChild(verdict);

              let btn = createButton();
              btn.style.margin = "0px";
              btn.innerHTML = "Submit"
              btn.onclick = () => {
                  verdict.style.display = "block";
                  correctEl.style.color = (darkMode ? "#0F0" : "#0B0");
                  correctEl.style.fontWeight = 500;
                  if (selectedEl == correctEl) {
                      verdict.innerHTML = "Correct answer!";
                      correctAnswers += 1;
                  } else {
                      verdict.innerHTML = "Incorrect answer!";
                      selectedEl.style.color = (darkMode ? "#F00" : "#C00");
                      selectedEl.style.fontWeight = 500;
                  }
                  btn.innerHTML = "Next";
                  btn.onclick = () => showQuestion(qIx + 1);
              };
              res.appendChild(btn);
          };

          showQuestion(0);
      } catch (e) {
          console.log(JSON.stringify(e));
          newDiv.style.textAlign = "left";
          newDiv.innerHTML = `<span style="font-weight:500;">Something went wrong!</span><br><br>${e.stack.toString().replaceAll('\n', '<br>')}`;
      }
  };

  let addQuestionsButton = async () => {
      let mainDiv = await getElement(document, "#primary-inner");
      let infoDiv = await getElement(mainDiv, "#info");
      let menuDiv = await getElement(infoDiv, "#menu-container");
      menuDiv = await getElement(menuDiv, "#top-level-buttons-computed");

      let btn = createButton();
      btn.style.margin = "auto 10px";
      btn.innerHTML = "QUESTIONS";
      btn.onclick = () => {
          btn.remove();
          registeredElements.pop(btn);
          displayQuestions();
      };
      menuDiv.prepend(btn);
      registeredElements.push(btn);
  }

  let pageUrl = null;
  let registeredElements = [];
  let updatePage = async () => {
      if (window.location.href == pageUrl) return;
      pageUrl = window.location.href;

      registeredElements.forEach((n) => n.remove());
      registeredElements = [];

      if (window.location.pathname != "/watch") return;

      subtitles = await getSubtitles();
      if (subtitles != null)
          addQuestionsButton();
  };

  let main = () => {
      setInterval(updatePage, 100);
  };

  main();

})();