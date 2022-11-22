#pragma once
#include <bits/stdc++.h>
#include <Windows.h>
#include <thread>
using namespace std;
#pragma comment(lib,"winmm.lib")
const string lkey[26]={"7","6^^","4^^","2^","6,","3^","4^","5^","4","6^","7^","1^^","0","7^^","5","6","4,","7,","1^","1","3","5^^","5,","3^^","2","2^^"};
const string nkey[10]={"3,","1,,","2,,","3,,","4,,","5,,","6,,","7,,","1,","2,"};
string key2num(string s){
	s=s+' ';int n=s.size();
	string res;
	for (int i=0;i<n;++i){
		char c=s[i];
		if (c>='0' && c<='9') res=res+' '+nkey[c-'0'];
		else if (c>='a' && c<='z') res=res+' '+lkey[c-'a'];
		else if (c>='A' && c<='Z') res=res+' '+lkey[c-'A']+'#';
		else{
			switch (c){
				case '!':res=res+" 1,,#";break;
				case '@':res=res+" 2,,#";break;
				case '$':res=res+" 4,,#";break;
				case '%':res=res+" 5,,#";break;
				case '^':res=res+" 6,,#";break;
				case '*':res=res+" 1,#";break;
				case '(':res=res+" 2,#";break;
				case '=':res=res+" 0";break;
				case '[':res=res+" [";break;
				default:res=res+c;
			}
		}
	}
	return res;
}
class MusicList{
public:
	int dctn=500;
	vector <string> vec;
	MusicList(int _dctn=500){
		dctn=_dctn;vec.clear();
	}
	~MusicList(){}
	void add(string s){
		vec.push_back(s);
	}
	void addk(string s){
		vec.push_back(key2num(s));
	}
	void clear(){
		vec.clear();
	}
	void setDelay(int _dctn){
		dctn=_dctn;
	}
	void readFile(string fileName,bool isKey=0){
		ifstream in(fileName);
		in>>dctn;if (dctn<0) isKey=1,dctn=-dctn;
		string s;
		while (getline(in,s)){
			if (isKey) addk(s);
			else add(s);
		}
		in.close();
	}
};
class MusicPlayer{
private:
	enum scale{
		Rest=0,
		C8=108,
		B7=107,A7s=106,A7=105,G7s=104,G7=103,F7s=102,F7=101,E7=100,D7s=99, D7=98, C7s=97, C7=96,
		B6=95, A6s=94, A6=93, G6s=92, G6=91, F6s=90, F6=89, E6=88, D6s=87, D6=86, C6s=85, C6=84,
		B5=83, A5s=82, A5=81, G5s=80, G5=79, F5s=78, F5=77, E5=76, D5s=75, D5=74, C5s=73, C5=72,
		B4=71, A4s=70, A4=69, G4s=68, G4=67, F4s=66, F4=65, E4=64, D4s=63, D4=62, C4s=61, C4=60,
		B3=59, A3s=58, A3=57, G3s=56, G3=55, F3s=54, F3=53, E3=52, D3s=51, D3=50, C3s=49, C3=48,
		B2=47, A2s=46, A2=45, G2s=44, G2=43, F2s=42, F2=41, E2=40, D2s=39, D2=38, C2s=37, C2=36,
		B1=35, A1s=34, A1=33, G1s=32, G1=31, F1s=30, F1=29, E1=28, D1s=27, D1=26, C1s=25, C1=24,
		B0=23, A0s=22, A0=21	
	};
	const int C_Scale[7][7]={{C1,D1,E1,F1,G1,A1,B1},
							 {C2,D2,E2,F2,G2,A2,B2},
							 {C3,D3,E3,F3,G3,A3,B3},
							 {C4,D4,E4,F4,G4,A4,B4},
							 {C5,D5,E5,F5,G5,A5,B5},
							 {C6,D6,E6,F6,G6,A6,B6},
							 {C7,D7,E7,F7,G7,A7,B7}};
	const int C_Scale_s[7][7]={{C1s,D1s,-1,F1s,G1s,A1s,-1},
							   {C2s,D2s,-1,F2s,G2s,A2s,-1},
							   {C3s,D3s,-1,F3s,G3s,A3s,-1},
							   {C4s,D4s,-1,F4s,G4s,A4s,-1},
							   {C5s,D5s,-1,F5s,G5s,A5s,-1},
							   {C6s,D6s,-1,F6s,G6s,A6s,-1},
							   {C7s,D7s,-1,F7s,G7s,A7s,-1}};
	HMIDIOUT handle;
	int dctn=500;
	void delay(int ctn){
		Sleep(dctn*ctn/32);
	}
	vector <int> nbuf;
	void playAll(int ctn){
		if (nbuf.empty()) return;
		for (int i=0;i<(int)nbuf.size();++i){
			midiOutShortMsg(handle,nbuf[i]);
		}
		delay(ctn);
		nbuf.clear();
	}
	int volume=0x7f;
public:
	bool ENDMUSIC=0;
	MusicPlayer(){
		midiOutOpen(&handle,0,0,0,CALLBACK_NULL);
	}
	~MusicPlayer(){
		midiOutClose(handle);
	}
	void setVolume(int _vol){
		volume=_vol;
	}
	void setDelay(int _dctn){
		dctn=_dctn;
	}
	void play(string s){
		//cout<<s<<endl;
		s=s+' ';int n=s.size();
		int ctn=32,vol=volume;
		bool isChord=0;nbuf.clear();
		for (int i=0;i<n;++i){
			if (ENDMUSIC) break;
			char c=s[i];
			switch (c){
				case '[':{
					assert(isChord==0);
					isChord=1;
					break;
				}
				case ']':{
					assert(isChord==1);
					isChord=0;
					break;
				}
				case ' ':{
					if (!isChord){
						playAll(ctn);
						ctn=32;
					}
					break;
				}
				case '|':break;
				case '_':{
					ctn/=2;
					break;
				}
				case '.':{
					ctn*=1.5;
					break;
				}
				case '-':{
					ctn+=32;
					break;
				}
				case '0':{
					nbuf.push_back(Rest);
					playAll(ctn);
					break;
				}
				default:{
					assert(c>='1' && c<='7');
					int x=(int)c-48,lvl=3;
					bool isSharp=0;
					for (int j=i+1;j<n;++j){
						if (s[j]=='^') lvl++;
						else if (s[j]==',') lvl--;
						else if (s[j]=='#') isSharp=1; 
						else break;
						i++;
					}
					if (isSharp) nbuf.push_back((vol<<16)+(C_Scale_s[lvl][x]<<8)+0x90);
					else nbuf.push_back((vol<<16)+(C_Scale[lvl][x]<<8)+0x90);
					break;
				}
			}
		}
	}	
	void playList(MusicList &m){
		dctn=m.dctn;ENDMUSIC=0;
		for (int i=0;i<(int)m.vec.size() && !ENDMUSIC;++i) play(m.vec[i]);
	}
};
class BGM{
public:
	MusicPlayer player;
	MusicList nowList;
	BGM(string name,int volume=0x7f){
		nowList.readFile(name);player.setVolume(volume);
	}
	~BGM(){
		player.ENDMUSIC=1;
	}
	void setMusic(string name){
		nowList.readFile(name);
	}
	void play_thread(){
		while (1){
			player.playList(nowList);
			if (player.ENDMUSIC) break;	
		}
	}
	void play(){
		player.ENDMUSIC=0;
		thread bgm(&BGM::play_thread,this);bgm.detach();
	}
	void stop(){
		player.ENDMUSIC=1;
	}
};