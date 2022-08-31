import parse, { NodeType } from "node-html-parser";
import 'dotenv/config'
import * as natural from 'natural';
import fetch from "cross-fetch";
import { APIErrorCode, APIResponseError, Client } from "@notionhq/client";
import { PageObjectResponse, QueryDatabaseResponse } from "@notionhq/client/build/src/api-endpoints";
import { Presets, SingleBar } from "cli-progress";
const notion = new Client({ auth: process.env.NOTION_KEY });
const databaseId = process.env.NOTION_DATABASE_ID as string;
interface Company {
  cities: Array<string>;
  text: string;
  name: string;
  url: string;
  raw: string;
  tags: Array<string>
}
function getTags(){
    const tagMap = new Map<string,string>([
        ['3D','3D'],
        ['accessibility','accessibility localization'],
        ['ads','advertisement advertise ads'],
        ['ai','ai nlp intelligent forecasting autonomous intelligence artificial'],
        ['animal','animal horse equestrian veterinary hunt livestock pet dog cat'],
        ['art','art'],
        ['audio','audio'],
        ['b2b','b2b'],
        ['b2c','b2c'],
        ['battery','batteries charging electronics'],
        ['biotech','biomed bioprinting biotech biomaterial'],
        ['booking','booking'],
        ['brand','scale branding'],
        ['cloud','cloud'],
        ['construction','construction architect building'],
        ['crypto','crypto cryptocurrency blockchain'],
        ['customer','loyalty'],
        ['developers','code api backend'],
        ['education','student learning education university'],
        ['iot','embedded iot things'],
        ['environment','recycle recycling vegan vegetarian plant sustainable organic ecological bike battery electric energy charging climate circular carbon forestry nature composable waste disease ev fossil fertilizer algae pollution pollutants'],
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
        ['sport','football golf sport bowlers fitness skiing fitness walking'],
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
    const stemMap = new Map<string,Set<string>>()
    tagMap.forEach((tokens,tag) =>  
        {
            const stemmed = natural.PorterStemmer.tokenizeAndStem(tokens)
            stemmed.forEach(word=>{
                if(stemMap.has(word)){
                    stemMap.get(word)?.add(tag)
                }
                else{
                    stemMap.set(word,new Set([tag]))
                }
            })
        }
    );
    return stemMap
}
async function scrapeCompanies() {
  const url = "https://www.swedishtechnews.com/ultimate-swedish-startups-list/";
  const text = await (await fetch(url)).text();
  const root = parse(text);
  const tagMap = getTags();
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
        const commaSeparated = cleaned.split(",");
        city = commaSeparated[0];
        text = commaSeparated.slice(1).join(",").replace(/[()]/g, "");
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
      const tokens = natural.PorterStemmer.tokenizeAndStem(text)
      const tags = new Array<string>()
      const empty = new Set<string>();
      tokens.forEach(token=> {
        const tokenTags = tagMap.get(token) || empty 
        tags.push(...tokenTags)
      })
      return {
        url: n.getAttribute("href") as string,
        name: n.textContent,
        text,
        cities: cities.filter(c=> !!c),
        raw,
        tags: Array.from(new Set<string>(tags)).filter(t=>!!t)
      };
    })
    .slice(3);
    return companies;
}
async function addCompaniesToNotion(companies:Array<Company>,exclude: Set<string>){
  const bar1 = new SingleBar({},Presets.shades_classic);
  const createdPages = new Array<string>()
  bar1.start(companies.length,0)
    for( const company of companies){
      if(!exclude.has(company.name)){
        const pageId = await addCompanyToPage(company)
        if(pageId){
          createdPages.push(pageId)
        }
       
      }
      bar1.increment()
    }
    return createdPages
}
async function addCompanyToPage(company: Company) {
    try {
        const resp = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: { 
                "Name": { title: [{ text: { content: company.name } }] },
                "Description": {rich_text: [{text: {content: company.text}}]},
                "Link": {url: company.url} ,
                "Cities": {multi_select: company.cities.map(c=> ({name:c.trim()}))},
                "Raw": {rich_text: [{text: {content: company.raw}}]},
                "Tags": {multi_select: company.tags.map(t=> ({name: t}))}
            },
          });
          return resp.id
    }catch(e){
        const notionError = e as APIResponseError;
        if(notionError.code === APIErrorCode.ConflictError){
            console.warn("Conflict with name", company.name)
        }
        else{
            console.warn({message:notionError.message,errorCode:notionError.code, statusCode: notionError.status})
        }
        return ""
    }
  
  
}
export function unique<K, V>(items: V[], getKey: (item: V) => K): V[] {
	const s: Set<K> = new Set();
	const filtered: Array<V> = [];
	items?.forEach((item) => {
		const key = getKey(item);
		if (!s.has(key)) {
			s.add(key);
			filtered.push(item);
		}
	});
	return filtered;
}
async function getPagesFromCursor(startCursor?: string):Promise<QueryDatabaseResponse> {
  return notion.databases.query({database_id: databaseId, sorts:[{property:'Name',direction:'ascending'}],start_cursor: startCursor,page_size:100},);
}
async function getExistingPageNames() {
  const pages: Array<PageObjectResponse> = []
  let startCursor: string | undefined  = undefined;
  while(true){
    const res: QueryDatabaseResponse = await getPagesFromCursor(startCursor)
    const results = res.results as Array<PageObjectResponse>
    pages.push(...results)
    startCursor = res.next_cursor || undefined
    if(!startCursor){
      break;
    }
    
  }
  const names = new Array<string>()
  const bar2 = new SingleBar({},Presets.shades_classic);
  bar2.start(pages.length,0)
  for (const page of pages){
    const propertyResult = await notion.pages.properties.retrieve({
      page_id: page.id,
      property_id: page.properties["Name"].id
    })
   if(propertyResult.object === 'list'){
      const firstRes = propertyResult.results[0]
      if(firstRes.type === 'title'){
        names.push(firstRes.title.plain_text)
      }
   }
   bar2.increment()
  }
  return names
}
async function main(){
  const companies = await scrapeCompanies();
  const pageNames = await getExistingPageNames();
  const createdPages =await addCompaniesToNotion(companies, new Set(pageNames))
  console.log({created: createdPages.length,scraped: companies.length})

}

main();
