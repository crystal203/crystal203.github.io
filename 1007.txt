#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
void setCursorShow(int tp){
    HANDLE fd=GetStdHandle(STD_OUTPUT_HANDLE);
    CONSOLE_CURSOR_INFO cinfo;
    cinfo.bVisible=tp;
    cinfo.dwSize=1;
    SetConsoleCursorInfo(fd,&cinfo);
}
void setWindowSize(){
    system("title Animation");
    char cmd[30];
    sprintf(cmd,"mode con cols=%d lines=%d",70,20);
    system(cmd);
}
void gotoxy(int x,int y){
    COORD pos;
    pos.X=y;
    pos.Y=x;
    SetConsoleCursorPosition(GetStdHandle(STD_OUTPUT_HANDLE),pos);	
}
void setColor(int colorID){
    SetConsoleTextAttribute(GetStdHandle(STD_OUTPUT_HANDLE),colorID);
}
void clrscr(){
    setColor(0x0f);system("cls");
}
#define HEIGHT 13
#define WIDTH 9
const char frame[3][HEIGHT][WIDTH]={
	{
		" *****   ",
		" *   *   ",
		" *****   ",
		"    *    ",
		"    *    ",
		"   ***   ",
		"  * * *  ",
		" *  *  * ",
		"    *    ",
		" *****   ",
		" *   *   ",
		" *     * ",
		"        *"
	},{
		"  *****  ",
		"  *   *  ",
		"  *****  ",
		"    *    ",
		"    *    ",
		"   ***   ",
		"  * *    ",
		" *  *    ",
		"    *    ",
		"   ***   ",
		"  *   *  ",
		" *     * ",
		"*       *"
	},{
		"  *****  ",
		"  *   *  ",
		"  *****  ",
		"    *    ",
		"    *    ",
		"   ***   ",
		"    * *  ",
		"    *  * ",
		"    *    ",
		"   ***** ",
		"  *    * ",
		" *     * ",
		"*        "
	}
};
void drawFrame(int id){
	gotoxy(0,0);
	for (int i=0;i<HEIGHT;++i){
		for (int j=0;j<WIDTH;++j){
			setColor(rand()%8+8);
			putchar(frame[id][i][j]);
		}
		putchar('\n');
	}
}
#define press(VK_NONAME) ((GetAsyncKeyState(VK_NONAME)&0x8000)?1:0)
int main(){
	setWindowSize();clrscr();
	setCursorShow(0);
	gotoxy(15,0);puts("Press 'E' to Exit.");
	drawFrame(0);
	for (int f=0;;f=(f+1)%3){
		drawFrame(f);
		for (int st=clock();1.0*(clock()-st)/CLOCKS_PER_SEC<0.15;Sleep(1)){
			if (press('E')) break;
		}
		if (press('E')) break;
	}
	setColor(7);setCursorShow(1);
	return 0;
}