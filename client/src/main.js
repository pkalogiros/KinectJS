/*********************************
* VERSION I, 22 Dec 2011
*---------------------------------
* Supports :
*	- Chrome / Firefox Support
*	- Two player tracking with 22 joints of information
*	- RGB (640x480) and Depth(320x240) image streaming
*	- Access and control of Kinect's motor
*	- Cursor object
*	- Modal with custom connection dialog
*	- Regions based interface
*	- Setting joints tracked, metrics mode, players number,
*	  sensor angle, distance to track, etc
*	- predefined gestures
*
* Guidelines :
*	_name 	  --> private members
*   camelCase --> functions
*   test_var  --> public variables
*	UPPERCASE --> constants
*	####	  --> 4 sharp symbols for critical commentary
*	q		  --> var q, is used as cache for 'this'
*
*	Author		: Pantelis Kalogiros
*	url			: kinect.childnodes.com
*	license		: http://www.opensource.org/licenses/mit-license.php
**********************************/
(function( parent ) {
	!parent && ( parent = window )

	//Private Variable Declaration
	var _ws = null,					//joints websocket instance
		_send_buffer = [],			//initial send buffer (configuration packets)
		_msg_arr = [],				//contains functions that will be called on each message received from the server
		_reg = {					//main configuration object, stores the user/app defined options and is sent to the socket server on initialization
			players  	: 2,						//max players (2 is the limit actually)
			relative 	: true,						//use relative tracking?
			meters	 	: false,					//if set, meters based tracking will be used, please see kinect.childnodes.com for documentation
			sensitivity	: false,					//use sensitivity? (only if percentage-based tracking)
			joints	 	: [ 'RIGHT_HAND', 'HEAD' ],	//which joints will be tracked?
			gestures 	: [ 'ESCAPE' ]				//and which gestures do we need? //example [ 'ESCAPE', 'SWIPE' ]
		},
		_escapeInterval = null,					//Timeout : placeholder for the escape gesture

	kinect = parent.kinect = {
		address : null,				//(string) server address ( with port specified )
		is_ready : false,			//(bool) is the websocket open and socket ready

		escape_duration	:	1700,	//(milliseconds int) duration of the custom escape gesture

		/** Modified on message received **/
		sk_len : 0,					//skeletons / players count
		coords : [					//coordinates object
			[{x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}],
			[{x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}]
		], //sample data

		//Functions Declaration
		/*****************************
		* send( STRING ) : chainable - Added on vI
		* ----------------------------
		* - Sends data through the websocket.
		* 	If the websocket is not ready then
		*	stores it for later use
		******************************/
		send : function( data ) {

			this.is_ready
			?	_ws.send( data )
			:	_send_buffer.push( data );

			return this;
		},
		/*****************************
		* getSetup()  - Added on vI
		* ----------------------------
		* - returns the _reg object
		*****************************/
		getSetup : function() {
			return _reg;
		},
		/*****************************
		* setUp( OBJECT ), chainable  - Added on vI
		* ----------------------------
		* - Accepts user defined options (see _reg object)
		* 	and pushes them to the buffer
		*****************************/
		setUp : function( obj ) {
			var message_array = [],
				len;

			_send_buffer = [];
			_extend( _reg, obj );

			message_array.push( this._jointsToInt( _reg.joints ).join('-') );

			if( _reg.meters ) {
				var tmp,
					rel = _reg.meters.reg,
					abs = _reg.meters.abs;

				if( rel )
				{
					tmp = "MR" + rel.x + "-" + rel.y + "-" + rel.z;
					message_array.push( tmp );
				}
				if( abs )
				{
					tmp = "MA" + abs.x + "-" + abs.y + "-" + abs.z;
					message_array.push( tmp );
				}
			}

			if( _reg.sensitivity )
				message_array.push( "S" + _reg.sensitivity );

			if( _reg.relative )
				message_array.push( "R1" );
			else
				message_array.push( "R0" );

			message_array.push( "G" + _reg.gestures.join('-') );
			message_array.push( "P" + _reg.players );

			len = message_array.length;

			while( len-- )
				this.send( message_array[ len ] );

			message_array = len = null;
			return this;
		},
		/*****************************
		* make( STRING ), chainable  - Added on vI
		* ----------------------------
		* - Accepts user defined ip address (with port)
		* 	example: 192.168.50.45:8820 - or for "localhost"
		*	only a port (example: 9200) which is given by the
		*	KinectSocketServer app (please read: http://kinect.childnodes.com)
		*****************************/
		make : function( addr ) {
			var q = this,
				ChromeOrMoz = null;	//#### since we only support Chrome / Moz, let's say 'webkit' for Chrome,
									//'firefox' for FireFox and false for not supported
									//support for IE10 will be available soon
			if( !addr )
				return false;

			//#### dirty sniff to see if we are using FireFox/Chrome
			!( ChromeOrMoz = _sniff() )
			&& q.browserNotSupported();

			addr.length === 4	//port specified
			&& ( addr = 'localhost:' + addr );

			ChromeOrMoz === "firefox"
			? _ws = new MozWebSocket( 'ws://' + addr )
			: _ws = new WebSocket( 'ws://' + addr );

			q.address = addr.replace( /\s+/g, '' ); //sanity check: removing spaces from the address

			//on open -- call the onConnect function and set 'is_ready' to true
			_ws.onopen = function() {
				q.is_ready = true;
				q.onConnect();

				var i = -1,
					buffer_interval;

				setTimeout( function() {
					buffer_interval = setInterval( function() {
						if( _send_buffer[ ++i ] )
							q.send( _send_buffer[ i ] );
						else {
							clearInterval( buffer_interval );
							buffer_interval = null;

							setTimeout( function() {	//approx 2 seconds later call the init function
								q._configInit();
							}, 1850 );					//#### perhaps the server should respond with a callback? "Allset"? Something less dirty
						}
						return false;
					}, 17 );
				}, 300 );
			};

			//on close -- call the onClose function and set is_ready to false
			_ws.onclose = function() {
				if( !kinect.is_ready ) //the socket was never open
				{
					kinect.onInvalid();
					return false;
				}
				kinect.is_ready = false;
				kinect.onClose();
			};
			//on message -- grab the coords, and call all the _msg_arr stored functions
			_ws.onmessage = function( e ) {
				var len = _msg_arr.length;

				q._coords( e );

				while( len-- )
					_msg_arr[ len ].call( q, e );
			}
			return q;
		},
		/*****************************
		* makeDepth( STRING, BOOL, STRING ), webWorker  - Added on vI
		* ----------------------------
		* - Accepts user defined ip address (with port)
		* 	example: 192.168.50.45:8820 - or for "localhost"
		*	OR uses the existing one for the joints websocket.
		*
		*	addr (string) - kinectSocketServer address, if left empty
		*					joints socket address will be used
		*
		*	webWorker (bool) - if set to true, the new socket will open
		*					 - within a webworker
		*
		*	path (string) - path to the webWorker javascript file,
		*						- if left empty (or unspecified) the default
		*						- one will be used
		*
		*	Depth - resolution 320 x 240
		*****************************/
		makeDepth : function( addr, WebWorker, path ) {
			var q = this,
				_depthWS,
				ChromeOrMoz = null;

			if( !addr && !this.address )	//if no address is specified and
			{								//no address is stored, wait for connection
				(function( addr, WebWorker, path ) {
					kinect.addEventListener( 'openedSocket', function() {
						if( kinect._depthWS )
						{
							kinect.makeDepth( addr, WebWorker, path );
							return false;
						}
					}, false );
				})( addr, WebWorker, path );
				return false;
			}

			!addr && ( addr = this.address );

			!( ChromeOrMoz = _sniff() )
			&& q.browserNotSupported();

			addr.length === 4	//port specified
			&& ( addr = 'localhost:' + addr );

			if( !WebWorker )
				ChromeOrMoz === "firefox"
				? _depthWS = new MozWebSocket( 'ws://' + addr + '/__depth/' )
				: _depthWS = new WebSocket( 'ws://' + addr + '/__depth/' );
			else
			{
				if( path && path.length > 1 )
					_depthWS = new Worker( path );
				else
					_depthWS = new Worker('workerSocket.js');

				_depthWS.postMessage({ addr : 'ws://' + addr + '/__depth/', socket : ChromeOrMoz });
			}
			kinect._depthWS = _depthWS;
			return _depthWS;
		},
		/*****************************
		* makeRGB( STRING ), webWorker  - Added on vI
		* ----------------------------
		* - Accepts user defined ip address (with port)
		* 	example: 192.168.50.45:8820 - or for "localhost"
		*	OR uses the existing one for the joints websocket.
		*
		*	addr (string) - kinectSocketServer address, if left empty
		*					joints socket address will be used
		*
		*	webWorker (bool) - if set to true, the new socket will open
		*					 - within a webworker
		*
		*	path (string) - path to the webWorker javascript file,
		*						- if left empty (or unspecified) the default
		*						- one will be used
		*
		*	RGB Resolution : 640 x 480
		*****************************/
		makeRGB : function( addr, WebWorker, path ) {
			var q = this,
				_rgbWS,
				ChromeOrMoz = null;

			if( !addr && !this.address )	//if no address is specified and
			{								//no address is stored, wait for connection
				(function( addr, WebWorker, path ) {
					kinect.addEventListener( 'openedSocket', function() {
						if( kinect._rgbWS )
						{
							kinect.makeRGB( addr, WebWorker, path );
							return false;
						}
					}, false );
				})( addr, WebWorker, path );
				return false;
			}

			!addr && ( addr = this.address );

			!( ChromeOrMoz = _sniff() )
			&& q.browserNotSupported();

			addr.length === 4	//port specified
			&& ( addr = 'localhost:' + addr );

			if( !WebWorker )
				ChromeOrMoz === "firefox"
				? _rgbWS = new MozWebSocket( 'ws://' + addr + '/__rgb/' )
				: _rgbWS = new WebSocket( 'ws://' + addr + '/__rgb/' );
			else
			{
				if( path && path.length > 1 )
					_rgbWS = new Worker( path );
				else
					_rgbWS = new Worker('workerSocket.js');

				_rgbWS.postMessage({ addr : 'ws://' + addr + '/__rgb/', socket : ChromeOrMoz });
			}

			kinect._rgbWS = _rgbWS;
			return _rgbWS;
		},
		/*****************************
		* close(), chainable  - Added on vI
		* ----------------------------
		* - Manually closes the connection
		*	(Chrome 17 has a bug with closing websocket connections, 
		*	 this is a possible solution)
		*****************************/
		close : function() {
			_ws.send("KILL");
			_ws.close();

			return this;
		},
		/*****************************
		* onInvalid(), onConnect(), onClose - Added on vI
		* ----------------------------
		* - PRIVATE, fire the corresponding events
		*****************************/
		onInvalid : function() {
			console.log("INVALID SOCKET");
			this.fireEvent( 'invalidSocket' );

			return false;
		},
		onConnect : function() {
			console.log("OPENED JOINTS SOCKET");
			this.fireEvent( 'openedSocket' );

			return false;
		},
		onClose : function() {
			console.log("CLOSED JOINTS SOCKET");
			this.fireEvent( 'closedSocket' );

			return false;
		},
		/*****************************
		* reconnect( STRING ), Boolean  - Added on vI
		* ----------------------------
		* - Calls make, with the same address
		*	returns true on reconnect attempt
		*	and false on abort.
		*****************************/
		reconnect : function() {
			if( this.addr && !this.is_ready ) {
				this.make( this.addr );
				this.fireEvent( 'reconnect' );
				return true;
			}
			return false;
		},
		/*****************************
		* _coords( e ), called automatically  - Added on vI
		* ----------------------------
		* - Accepts json returned from the KinectWebSocketServer
		* and evaluates it, storing it either in the kinect.coords object
		* or calls a function nested in the _ object ( gestures )
		*****************************/
		_coords : function( e ) {
			"use strict";				//restricting the scope of eval

			var _ = this._,				//and giving access to the _ object
				cache = eval( e.data );	// #### TODO: perhaps use new Function instead of eval?
										// or JSON.parse, and a lookup table?
			if( !cache )
				return false;

			this.coords = cache;
			this.sk_len = this.coords.length;

			return false;
		},
		/*****************************
		* onMessage( FUNCTION ), chainable  - Added on vI
		* ----------------------------
		* - Pushes a function to the _msg_arr array, functions that run
		*	on message received
		*****************************/
		onMessage : function( func ) {
			_msg_arr.push( func );

			return this;
		},
		//CONFIG FUNCTIONS
		/*****************************
		* _configInit(), editable  - Added on vI
		* ----------------------------
		* - Called when the reg object
		*	(config) has been sent to the server
		*****************************/
		_configInit : function() {
			console.log('Kinect Ready');
			this.fireEvent( 'kinectReady' );
			return false;
		},
		/*****************************
		* onPlayerFound(), chainable  - Added on vI
		* ----------------------------
		* - Functions pushed, will be called when a player is detected by the kinect
		*****************************/
		onPlayerFound : function( func ) {
			this.addEventListener( 'playerFound', func );
			return this;
		},
		/*****************************
		* onPlayerLost(), chainable  - Added on vI
		* ----------------------------
		* - Functions pushed, will be called when a player is 'lost'
		*****************************/
		onPlayerLost : function( func ) {
			this.addEventListener( 'playerLost', func );
			return this;
		},
		/*****************************
		* fireEvent( STRING, ARRAY ), chainable  - Added on vI
		* ----------------------------
		* - Fires a custom event to the event-sink object
		*****************************/
		fireEvent : function( vnt, args ) {
			var func_arr = this._sink[ vnt ],
				len;

			func_arr
			? len = func_arr.length
			: len = 0;

			// args should be an array, (for .call)
			// we can also push the function index
			// for unnamed function handling
			while( len-- )
				func_arr[ len ].call( this, args );

			func_arr = len = null;
			return this;
		},
		/*****************************
		* addEventListener( EVENT NAME, FUNCTION NAME ), chainable  - Added on vI
		* ----------------------------
		* - Adds an event Listener and its callback to the div sink
		*****************************/
		addEventListener : function( vnt, func ) {
			if( !this._sink[ vnt ] )
				 this._sink[ vnt ] = [];

			this._sink[ vnt ].push( func );

			return this;
		},
		/*****************************
		* removeEventListener( EVENT NAME, FUNCTION NAME ), chainable  - Added on vI
		* ----------------------------
		* - Removes an event Listener from the sink div
		*****************************/
		removeEventListener : function( vnt, func ) {
			var func_arr = this._sink[ vnt ],
				len,
				index = false,
				i = -1;

			if( !func_arr )
				return false;

			len = func_arr.length;

			while( ++i < len )
				if( func_arr[ i ] == func )
				{
					index = i;
					break;
				}

			if( index )
				this._sink[ vnt ] = func_arr.slice( 0, index ).concat( func_arr.slice( index + 1, func_arr.length ) );

			func_arr = len = index = i = null;
			return this;
		},
		/*****************************
		* removeAllListeners( EVENT NAME ), chainable  - Added on vI
		* ----------------------------
		* - Removes all listeners of a specified event
		*****************************/
		removeAllListeners : function( vnt ) {
			this._sink[ vnt ] = null;

			return this;
		},
		//#### Invoke only from KinectWebSocketServer
		_ : {
			/*****************************
			* PLFOUND( int )
			* calls functions on player lost
			* count = the ammount of players
			*****************************/
			PLLOST : function( count ) {
				kinect.fireEvent( 'playerLost', [ count ] );

				return false;
			},
			/*****************************
			* PLFOUND( int )
			* calles the functions called on player found
			* count = the ammount of playerss
			*****************************/
			PLFOUND : function( count ) {
				kinect.fireEvent( 'playerFound', [ count ] );

				return false;
			},
			/*****************************
			* NOPLAYERS()
			* ----------------------------
			* - Called when there are no players on the screen
			*****************************/
			NOPLAYERS : function() {
				kinect.fireEvent( 'noPlayers' );

				return false;
			},
			//available gestures,
			//SWIPE, ESCAPE, ESCAPE2, HANDS_DIST, FOOT_LEAN, JUMP, STANCE, BODY_ANGLE
			/*****************************
			* SWIPE( int, int, string )
			* ----------------------------
			* index (int) - the player who performed the swipe
			* joint (int) - which joint performed the swipe
			* direction (string const) - which direction ( top, right, bottom, left )
			*****************************/
			SWIPE	: function( index, joint, direction ) {
				kinect.fireEvent( 'gestureSwipe', [ index, joint, direction ] );

				return false;
			},
			/*****************************
			* JUMP( int )
			* ----------------------------
			* index (int) - the player who jumped
			*****************************/
			JUMP	: function( index ) {
				kinect.fireEvent( 'gestureJump', [ index ] );

				return false;
			},
			/*****************************
			* ESCAPE( int )
			* ----------------------------
			* Custom escape gestures used
			* index (int) - player index
			*****************************/
			ESCAPE	: function( index, bool ) {
				kinect.fireEvent( 'gestureEscape', [ index, bool ] );

				if( index !== 0 )
					return false;
						
				clearTimeout( _escapeInterval );
				if( bool )
				{
					_escapeInterval = setTimeout( function() {
						clearTimeout( _escapeInterval );
						_escapeInterval = null;

						kinect.fireEvent( 'escapeInterval', [ index ] );
						index = bool = null;
					}, kinect.escape_duration );
				}
				else
					_escapeInterval = null;
					
				return false;
			},
			/*****************************
			* HANDS_DIST( int, bool )
			* ----------------------------
			* Fires, gestureCrank_ON when the player has his both arms
			* extended, and gestureCrank_OFF when contracted
			*****************************/
			HANDS_DIST : function( index, bool ) {
				if( bool )
					kinect.fireEvent( 'gestureCrank_ON', [ index ] );
				else
					kinect.fireEvent( 'gestureCrank_OFF', [ index ] );
				return false;
			},
			/*****************************
			* FOOT_LEAN( int, string, string )
			* ----------------------------
			* Leg posture ( akin to the swipes )
			* - index ( int ) : player index
			* - leftRight ( int ) : 'left' or 'right' leg
			* - action ( int ) : direction of the movement
			*
			* example of event fired
			* gestureFootLean with args [ 0, 'left', 'right' ]
			*****************************/
			FOOT_LEAN : function( index, leftRight, action ) {
				var footIndex = leftRight === 15 ? 'left' : 'right';

				kinect.fireEvent( 'gestureFootLean', [ index, footIndex, action ] );

				footIndex = null;
				return false;
			},
			/*****************************
			* BODY_ANGLE( int, string )
			* ----------------------------
			* Is fired when the player has his shoulders angled
			* relative to the kinect,
			* - index ( int ) 		: player index
			* - rotation ( string ) : rotation direction ( left, right )
			*****************************/
			BODY_ANGLE : function( index, rotation ) {
				kinect.fireEvent( 'gestureBodyTurning', [ index, rotation ] );

				return false;
			},
			
			FIRE	: function( args ) {
				kinect.fireEvent( 'externalButtonPress', args );
				
				return false;
			},
			/*****************************
			* MOTOR( int )
			* ----------------------------
			* Is fired after the user requests
			* the angle data from the kinect
			* is not actually a gestures, but it is called 
			* through the _ object
			*****************************/
			MOTOR	: function( deg ) {
				if( kinect.motor )
					kinect.motor.currentAngle = deg;
				
				kinect.fireEvent( 'motorAngleUpdated', [ deg ] );
				return false;
			}
		},
		/*****************************
		* scanForHead(), chainable  - Added on vI
		* ----------------------------
		* - Forces the Kinect to adjust its angle, so that the 
		*	first user's head is within proper range
		*****************************/
		scanForHead : function() {
			this.send("H");
			return this;
		},
		//TRACKING CONFIG FUNCTIONS
		/*****************************
		* toggleRelative(), chainable  - Added on vI
		* ----------------------------
		* - Toggles Relativity on tracking data
		*****************************/
		toggleRelative : function() {
			this.send("R");
			_reg.relative = !_reg.relative;

			return this;
		},
		/*****************************
		* setRelative( BOOLEAN ), chainable  - Added on vI
		* ----------------------------
		* - Sets Relative tracking,
		*	depends on the boolean val
		*****************************/
		setRelative : function( bool ) {
			if( bool )
			{
				this.send("R1");
				_reg.relative = true;
			}
			else
			{
				this.send("R0");
				_reg.relative = false;
			}
			return this;
		},
		/*****************************
		* setJoints( ARRAY ), chainable  - Added on vI
		* ----------------------------
		* - sets and sends new joint data (overwrites previous)
		*****************************/
		setJoints : function( joints ) {
			this.send( this._jointsToInt( joints ).join('-') );
			_reg.joints = joints;

			return this;
		},
		/*****************************
		* setPercentageMode(), chainable  - Added on vI
		* ----------------------------
		* - Deactivates the meters metric mode,
		*	and lets the Percentage Mode take over
		*****************************/
		setPercentageMode : function() {
			this.send( "M0" );
			_reg.meters = null;

			return this;
		},
		/*****************************
		* setPlayers( INT ), chainable  - Added on vI
		* ----------------------------
		* - sets and sends new player data
		*****************************/
		setPlayers : function( num ) {
			this.send( "P" + num );
			_reg.players = num;

			return this;
		},
		/*****************************
		* setSensitivity( FLOAT ), chainable  - Added on vI
		* ----------------------------
		* - sets and sends new sensitivity data (percentage based tracking only)
		*****************************/
		setSensitivity : function( num ) {
			this.send( "S" + num );
			_reg.sensitivity = num;

			return this;
		},
		/*****************************
		* addJoint( STRING ), chainable  - Added on vI
		* ----------------------------
		* - adds a joint to the tracking data
		*****************************/
		addJoint : function( joint ) {
			//check to see if the joint already exists
			var len = _reg.joints.length,
				flag = false;

			while( len-- )
				if( _reg.joints[ flag ] === joint ) {
					flag = true;
					break;
				}

			if( !flag )
			{
				_reg.joints.push( joint );
				this.send( this._jointsToInt( _reg.joints ).join('-') );
			}
			return this;
		},
		//UTIL FUNCTIONS
		/*****************************
		* _jointsToInt( OBJECT ), array  - Added on vI
		* ----------------------------
		* - Converts a string specified joint array(HAND_RIGHT, HEAD etc)
		*	to an int one (as specified by the MS Kinect SDK)
		*****************************/
		_jointsToInt : function( joint_array ) {
			var ret = [],
				joinLen = joint_array.length,
				tmp;

			while( joinLen-- ) {
				switch( joint_array[ joinLen ] ) {
					case ( "ANKLE_LEFT" ) :
						tmp = 14;
					break;
					case ( "ANKLE_RIGHT" ) :
						tmp = 18;
					break;
					case ( "ELBOW_LEFT" ) :
						tmp = 5;
					break;
					case ( "ELBOW_RIGHT" ) :
						tmp = 9;
					break;
					case ( "FOOT_LEFT" ) :
						tmp = 15;
					break;
					case ( "FOOT_RIGHT" ) :
						tmp = 19;
					break;
					case ( "HAND_LEFT" ) :
						tmp = 7;
					break;
					case ( "HAND_RIGHT" ) :
						tmp = 11;
					break;
					case ( "HIP_CENTER" ) :
						tmp = 0;
					break;
					case ( "HIP_LEFT" ) :
						tmp = 12;
					break;
					case ( "HIP_RIGHT" ) :
						tmp = 16;
					break;
					case ( "KNEE_LEFT" ) :
						tmp = 6;
					break;
					case ( "KNEE_RIGHT" ) :
						tmp = 17;
					break;
					case ( "SPINE" ) :
						tmp = 1;
					break;
					case ( "SHOULDER_CENTER" ) :
						tmp = 2;
					break;
					case ( "HEAD" ) :
						tmp = 3;
					break;
					case ( "SHOULDER_LEFT" ) :
						tmp = 4;
					break;
					case ( "SHOULDER_RIGHT" ) :
						tmp = 8;
					break;
					case ( "WRIST_LEFT" ) :
						tmp = 6;
					break;
					case ( "WRIST_RIGHT" ) :
						tmp = 10;
					break;
					case ( "BODY_ANGLE" ) :	//augmented bits
						tmp = 20;
					break;
					case ( "HANDS_DIST" ) :
						tmp = 21;
					break;
				}
				ret.unshift( tmp );
			}
			return ret;
		},
		/**********************************
		* threshold( NUMBER, NUMBER, NUMBER ) number util, Added on vI
		* --------------------------------
		* - Accepts a number, and a lower and higher value
		* 	cuts off the values that exceed the ones specified in
		* 	min & max
		**********************************/
		threshold : function( num, min, max ) {
			return num > max ? max : ( num < min ? min : num );
		},
		/**********************************
		* qeue( FUNCTION, INT ) chainable util, Added on vI
		* --------------------------------
		* - Schedules a function (callback), to be called in
		*   time ms with the kinect as its 'this' object,
		*	if no time is specified, thenn 1 second will be used
		**********************************/
		qeue : function( callback, time ) {
			setTimeout( function() {
				callback.call( kinect );
				callback = null;
				return false;
			}, !!time ? time : 1000 );

			return this;
		},

		/**********************************
		* browserNotSupported(), Added on vI
		* --------------------------------
		* - Called if the browser does not support websockets
		*	Feel free to override this function with yours
		**********************************/
		browserNotSupported : function() {
			kinect.fireEvent( "notSupported" );

			if( kinect.modal )	//modal behavior
			{
				var cached = kinect.modal;

				!cached.is_visible && ( cached.show() );

				cached.modal.innerHTML = '\
					<div id="knctGrnStrp" class="_c' + (( Math.random() * 4 + 1 ) >> 0 ) + '">\
					<div><h2>KinectJS</h2>\
					<p>You are using an unsupported browser : ( </p>\
					</div></div>';

				cached = null;
			}
			else	//regular behavior
				throw( "Your browser is not supported." );

			return false;
		},

		_sink : {}
		
		//END
	},
	/**********************************
	* _extend( OBJECT, OBJECT ) util, Added on vI
	* --------------------------------
	* - Simply extends the "target" object by adding to it
	* 	the "seed" one (no deep cloning, but it suffices)
	**********************************/
	_extend = function( target, seed ) {
		var key;

		for( key in seed )
			if( typeof target[ key ] !== "object" || ( typeof target[ key ] === "object" && target[ key ].length ))
				target[ key ] = seed[ key ];
			else
				_extend( target[ key ], seed[ key ] );
	},
	/**********************************
	* _sniff() util, Added on vI
	* --------------------------------
	* - Returns the browser css prefix
	* 	Avoids user agent string checking - currently
	* 	there is only support for Chrome 14+ and FF8+
	**********************************/
	_sniff	= function() {
		if( parent.WebSocket )
			return 'chrome';
		else if( parent.MozWebSocket )
			return 'firefox';
		else
			return false;
	};
})( window );

/*********************************
* KINECT MOTOR, 19/02/2012
*---------------------------------
* Accesses the Kinect Motor
**********************************/
(function( kinect ) {
	kinect.motor = {
		currentAngle	: null,
		scanForHead 	: kinect.scanForHead,
		
		/*********************************
		* getCurrentAngle(), chainable added on vI
		*---------------------------------
		* Contacts the socket Server, to retrieve 
		* the current kinect angle, it doesnot return the value
		* since it is an async function, the motor.currentAngle
		* will be updated instead, and an event fired (motorAngleUpdated)
		* returns kinect object
		**********************************/
		getCurrentAngle : function() {
			kinect.send("H_");
			return kinect;
		},
		/*********************************
		* defaultAngle(), chainable added on vI
		*---------------------------------
		* Resets the kinects angle
		**********************************/
		defaultAngle : function() {
			kinect.send("H:-6");
			return kinect;
		},
		/*********************************
		* getCurrentAngle( INT ), chainable added on vI
		*---------------------------------
		* Sets the current Kinect angle,
		* the value is filtered for out of range values
		* 
		* returns kinect object
		**********************************/
		setCurrentAngle	: function( deg ) {
			deg = kinect.threshold( ( deg / 1 ), -20, 20 );
			if( !!deg )
			{
				kinect.send( "H:" + deg );
				this.currentAngle = deg;
			}
			else
				throw( "wrong angle value" );

			return kinect;
		}
	};
})( kinect );