# LinkedIn Automation Bot

This LinkedIn Automation Bot is designed to automate tasks such as logging in, performing searches, and running custom scripts on LinkedIn using Puppeteer. It supports concurrent browser instances and allows for daily scheduling of the tasks.

## Prerequisites

- Node.js (>= 14.x)
- Puppeteer
- Git (for cloning the repository)

## Installation

### macOS

1. **Install Node.js and npm**

    You can install Node.js and npm using Homebrew:

    ``` sh
    brew install node
    ```
2. **Clone the repository**
    ``` sh
    git clone https://github.com/yourusername/linkedin-automation-bot.git
    cd linkedin-automation-bot
    ```
3. **Install dependencies**
    ``` sh
    npm install
    ```

## Windows

1. **Install Node.js and npm**

    Download and install Node.js from the [official website](https://nodejs.org/en).
2. **Clone the repository**
    ``` sh
    git clone https://github.com/yourusername/linkedin-automation-bot.git
    cd linkedin-automation-bot
    ```
3. Install dependencies
    ``` sh
    npm install
    ```

## Configuration

1. **Setup initial settings**

    On the first run, the script will prompt you to set up initial settings such as whether to run in headless mode, the number of browser instances to open, and the number of hours to run.

2. **Update LinkedIn credentials**
    The script will prompt you to enter your LinkedIn username and password during the first login attempt.

3. **Keyword Configuration**

    Add your search keywords in keywords.txt, each keyword on a new line.

4. **Control File**

    The control.json file will be used to determine whether the script should run the next day. You can manually set this to false to stop the script from running.


- ONLY WORKS ON WINDOWS AND CMD NEEDS TO BE LOADED AS AN ADMIN

- No compat for macos and linux yet

I - Prerequisites:
Ensure that you have nodejs and npm installed on your system. (Check their official website for instructions on installation)

II - Project Files:
Ensure that your project files adhere to the following:
	- Delete the settings.js and history.json files if any
	- Clear the contents of localStorage.json and cookies.json files
	- Make sure the keywords.json file has the following content:
		{
  			"currentKeyWord": {},
  			"keyWords": []
		}

III - Installing packages:
Install the required packages by running the following commands:
- npm install
- npm install -g pm2

IV - Running the program:
There are two ways to run the program:

1. Test Mode
To run the program in test mode, run the following command:
	- node index.js --run-now

V - Issues

1. "FATAL ERROR: Zone Allocation failed - process out of memory...": 
You might come across this issue during the time of the program. Run the following command instead;

- node --max-old-space-size=4096 index.js --run-now

This ensures the program has enough heap space




