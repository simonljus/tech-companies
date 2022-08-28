import parse, { NodeType } from "node-html-parser";
import fetch from 'cross-fetch';

const a: string ="hello ts"
async function scrape(){
    console.log(a);
    const url = 'https://www.swedishtechnews.com/ultimate-swedish-startups-list/';
    const text = await (await fetch(url)).text()
    const root = parse(text);
    let prevlink: null | string = null;
    let prevtext: null | string  = null;
    const withinParenthesis = /\(([^)]+)\)/
    const companies = root.querySelectorAll("body > div.site > div > div > main > article > div.post-content.gh-content.kg-canvas > p:nth-child(1) > a ").filter(n => n.tagName === 'A' && n.nextSibling.nodeType === NodeType.TEXT_NODE).map(n=> {
        const raw = n.nextSibling.textContent
    let text = raw.replace(/[()]/g,'')
   
    let city = text?.split(',')[0]
    if(!city){
        const cleaned = raw.split('(').slice(1).join('(')
        const commaseps = cleaned.split(',')
        city=commaseps[0]
        text = commaseps.slice(1).join(',').replace(/[()]/g,'') 
        console.log({city,text})
    }
    
    if(city && city.split(" ").some(w=> w.length && w[0] !== w[0].toUpperCase() && w !== 'and')){
        if(!text){
            text = city
        }
        city =''
    }
    const cities =city.split((/and|&/)).map(c=> c.trim())
        
       
    return {
    url: n.getAttribute('href'),
    text,
    cities,
    raw
    }
    }).slice(3)
}
scrape()