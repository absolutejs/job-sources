import {expect,test} from 'bun:test';
import {parseJobBoardUrl} from '../src/index';
test('hosted board and job URLs preserve provider, board case and Lever region',()=>{
 expect(parseJobBoardUrl('https://job-boards.greenhouse.io/example/jobs/123?gh_src=abc')).toEqual({provider:'greenhouse',board:'example'});
 expect(parseJobBoardUrl('https://boards.greenhouse.io/embed/job_board?for=example')).toEqual({provider:'greenhouse',board:'example'});
 expect(parseJobBoardUrl('https://jobs.lever.co/example/abc/apply')).toEqual({provider:'lever',board:'example',region:'global'});
 expect(parseJobBoardUrl('https://jobs.eu.lever.co/example/abc')).toEqual({provider:'lever',board:'example',region:'eu'});
 expect(parseJobBoardUrl('  https://jobs.ashbyhq.com/Ashby/abc/application  ')).toEqual({provider:'ashby',board:'Ashby'});
});
test('unsupported and ambiguous URLs never become provider fetch destinations',()=>{
 for(const url of ['https://jobs.lever.co.attacker.example/x','https://attacker.example/jobs.lever.co/x','https://user:pass@jobs.lever.co/x','http://jobs.lever.co/x','https://jobs.lever.co:444/x','https://jobs.lever.co/','https://jobs.ashbyhq.com/a%2Fb','https://boards.greenhouse.io/embed/job_board','https://boards.greenhouse.io/embed/job_board?for=../x','file:///jobs.lever.co/x','not a URL'])expect(parseJobBoardUrl(url)).toBeNull();
});
