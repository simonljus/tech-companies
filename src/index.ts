import parse, { NodeType } from "node-html-parser";
import 'dotenv/config'
import * as natural from 'natural';
import fetch from "cross-fetch";
import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_KEY });
const databaseId = process.env.NOTION_DATABASE_ID as string;
interface Company {
  cities: Array<string>;
  text: string;
  name: string;
  url: string;
  raw: string;
}
const a: string = "hello ts";
function getTags(){
    const tagMap = new Map<string,string>([
        ['3D','3D'],
        ['accessibility','accessibility localization'],
        ['ads','advertisement advertise ads'],
        ['ai','ai nlp intelligent forcasting autonomous intelligence artificial'],
        ['animal','animal horse equestrian veterninary hunt livestock pet dog cat'],
        ['art','art'],
        ['audio','audio'],
        ['b2b','b2b'],
        ['b2c','b2c'],
        ['battery','batteries charging electronics'],
        ['biotech','biomed bioprinting biotech biomaterial'],
        ['booking','booking'],
        ['brand','scale brading'],
        ['cloud','cloud'],
        ['construction','construction architect building'],
        ['crypto','crypto cryptocurrency blockchain'],
        ['customer','loyalty'],
        ['developers','code api backend'],
        ['education','student learning education university'],
        ['iot','embedded iot things'],
        ['environment','recycle recycling vegan vegetarian plant sustainable organic ecological bike battery electric energy charging climate circular carbon forestry nature compostable waste disease ev fossil fertilizer algae pollution pollutants'],
        ['energy','battery power energy electricity charging solar'],
        ['event','event'],
        ['legal','legal lawyer'],
        ['family','baby pregnancy relationship couple dating birth elderly divorce funeral children mother wedding parents'],
        ['fashion','shoes clothes fashion textile beauty wearable footwear'],
        ['finance','fintech financial finance bank stocks payment credit transaction expense earn income trading cash paid debt loan pay billing'],
        ['food','food vegan bee nutrition kitchen milk potato fishing farming farmer meat dairy seafood grocery restaurant meal lunch dinner breakfast cooked seaweed snacks cheese'],
        ['furniture','furniture'],
        ['gaming','games game esport gaming'],
        ['hardware','hardware'],
        ['health',' genetic doctor nurse patient health asthma clinical blood diabetes heart MRI cancer gene medicine telemedicine healthcare medical therapy drug dementia wound pain treatment injuries wellness  sleep stress disorder gut mental'],
        ['home','gardening'],
        ['job','recruiter recruitment hr salary employer employee job freelancer career office'],
        ['home', 'tenant room home homeowner'],
        ['hotel','hotel camping campsite'],
        ['marketplace','selling buying renting subscription marketplace'],
        ['mail','mail mailbox'],
        ['music','music instrument dj choir singer'],
        ['network','5G VPN'],
        ['insurance','insurance'],
        ['logistics','logistics'],
        ['quantum mechanics','quantum'],
        ['retail', 'buy sell rent seller subscription shopping retail'],
        ['robotics','robots robotics'],
        ['security','secure encryption encrypted security'],
        ['search','search'],
        ['social','social'],
        ['sport','football golf sport bowlers fitness skiing fitness waslking'],
        ['saas','saas platform'],
        ['storage','storage'],
        ['subscription','subscription rental'],
        ['transport','train vehicle car plane airplane flight bike transport motorcycle boat wheel road drone delivery cart carsharing motorhome ev scooter truck'],
        ['threat','threat'],
        ['media','video film photo images filmmakers audiobook ebook'],
        ['water','water'],
        ['women','female women mother pregnancy birth'],
        ['visualization','vr ar visualize graph'],
        ['web3','web3']
    ])
}
async function scrape() {
  const url = "https://www.swedishtechnews.com/ultimate-swedish-startups-list/";
  const text = await (await fetch(url)).text();
  const root = parse(text);
  let prevlink: null | string = null;
  let prevtext: null | string = null;
  const withinParenthesis = /\(([^)]+)\)/;
  const companies: Array<Company> = root
    .querySelectorAll(
      "body > div.site > div > div > main > article > div.post-content.gh-content.kg-canvas > p:nth-child(1) > a "
    )
    .filter(
      (n) => n.tagName === "A" && n.nextSibling.nodeType === NodeType.TEXT_NODE
    )
    .map((n) => {
      const raw = n.nextSibling.textContent;
      let text = raw.replace(/[()]/g, "");
     
      let city = text?.split(",")[0];
      if (city) {
       const trimmed = text?.split(",").slice(1).join(',').trim();
       if(trimmed){
        text = trimmed[0].toUpperCase() + trimmed.slice(1)
       }
      } else{
        const cleaned = raw.split("(").slice(1).join("(");
        const commaseps = cleaned.split(",");
        city = commaseps[0];
        text = commaseps.slice(1).join(",").replace(/[()]/g, "");
      }

      if (
        city
          ?.split(" ")
          .some((w) => w.length && w[0] !== w[0].toUpperCase() && w !== "and")
      ) {
        if (!text) {
          text = city;
        }
        city = "";
      }
      const cities = city.split(/and|&/).map((c) => c.trim());

      return {
        url: n.getAttribute("href") as string,
        name: n.textContent,
        text,
        cities,
        raw,
      };
    })
    .slice(3);
    //const allowedCities = new Set(["Stockholm","Uppsala"])
    //companies.filter(c=> c.cities.some(c=> allowedCities.has(c) ))
    const promises = companies.slice(1000,1100).map(c=> addCompanyToPage(c))
    const pageIds = await Promise.all(promises)
    return pageIds
}
async function addCompanyToPage(company: Company) {
    console.log(company)
    console.log({lancaster: natural.LancasterStemmer.tokenizeAndStem(company.text),
        porter: natural.PorterStemmer.tokenizeAndStem(company.text)})
  /*const resp = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: { 
        "Name": { title: [{ text: { content: company.name } }] },
        "Description": {rich_text: [{text: {content: company.text}}]},
        "Link": {url: company.url} ,
        "Cities": {multi_select: company.cities.map(c=> ({name:c.trim()}))},
        "Raw": {rich_text: [{text: {content: company.raw}}]},
    },
  });
  return resp.id*/
}

scrape();
