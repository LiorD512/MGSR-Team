const cheerio = require('cheerio');
const https = require('https');

const url = 'https://www.transfermarkt.com/ligat-haal/transfers/wettbewerb/ISR1?saison_id=2025&s_w=s';
const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }};

https.get(url, opts, (res) => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    const $ = cheerio.load(html);
    
    // Find first "In" table from first club
    let done = false;
    $('h2.content-box-headline').each((i, h2) => {
      if (done) return;
      const clubName = $(h2).text().trim();
      if (!clubName || clubName === 'Transfer record') return;
      
      const box = $(h2).closest('div.box');
      box.find('div.responsive-table').each((ti, tbl) => {
        if (done) return;
        const firstTh = $(tbl).find('tr').first().find('th').first().text().trim();
        if (firstTh !== 'In') return;
        
        // Print all TH headers
        const ths = [];
        $(tbl).find('tr').first().find('th').each((_, th) => ths.push($(th).text().trim()));
        console.log('Headers:', JSON.stringify(ths));
        
        // Print first 2 rows with ALL TD classes
        const rows = $(tbl).find('tr').filter((_, row) => $(row).find('th').length === 0 && $(row).find('td').length > 2);
        rows.slice(0, 2).each((ri, row) => {
          console.log('\nRow[' + ri + ']:');
          $(row).find('td').each((tdi, td) => {
            const cls = $(td).attr('class') || 'no-class';
            const text = $(td).text().trim().replace(/\s+/g, ' ').substring(0, 60);
            console.log('  TD[' + tdi + '] class="' + cls + '" text="' + text + '"');
          });
        });
        done = true;
      });
    });
  });
});
